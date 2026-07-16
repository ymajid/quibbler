package com.mercury.kdb;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.io.IOException;

/**
 * Manages a pool of kdb+ connections using c.java IPC.
 *
 * Supports the format: host:port:username:password
 * Username and password are optional (kdb+ Unix domain auth).
 */
public class ConnectionManager {

    public static class ConnectionInfo {
        public final String id;
        public final String name;
        public final String host;
        public final int port;
        public final String username;
        public final String password;
        public final String group;
        public final boolean connected;

        public ConnectionInfo(String id, String name, String host, int port,
                               String username, String password, String group, boolean connected) {
            this.id = id;
            this.name = name;
            this.host = host;
            this.port = port;
            this.username = username;
            this.password = password;
            this.group = group;
            this.connected = connected;
        }
    }

    private final Map<String, ManagedConnection> connections = new ConcurrentHashMap<>();

    private static class ManagedConnection {
        final String id;
        final String name;
        final String host;
        final int port;
        final String username;
        final String password;
        String group;   // mutable so connections can be moved between folders
        final boolean useTls;
        Object c;

        ManagedConnection(String id, String name, String host, int port,
                           String username, String password, String group, boolean useTls) {
            this.id = id;
            this.name = name;
            this.host = host;
            this.port = port;
            this.username = username;
            this.password = password;
            this.group = group;
            this.useTls = useTls;
        }
    }

    public String addConnection(String name, String host, int port,
                                 String username, String password, String group, boolean useTls) {
        String id = UUID.randomUUID().toString().substring(0, 8);
        return addConnection(id, name, host, port, username, password, group, useTls);
    }

    public String addConnection(String id, String name, String host, int port,
                                 String username, String password, String group, boolean useTls) {
        ManagedConnection mc = new ManagedConnection(id, name, host, port,
                username, password, group, useTls);
        connections.put(id, mc);
        return id;
    }

    public void removeConnection(String id) {
        ManagedConnection mc = connections.remove(id);
        if (mc != null && mc.c != null) {
            try {
                mc.c.getClass().getMethod("close").invoke(mc.c);
            } catch (Exception ignored) {}
        }
    }

    public Object getConnection(String id) throws IOException {
        ManagedConnection mc = connections.get(id);
        if (mc == null) {
            throw new IllegalArgumentException("Unknown connection: " + id);
        }
        // Reconnect only if we have no socket. We deliberately DON'T ping-per-query
        // (k "1"): that extra read is a desync vector, and a dead socket is instead
        // detected by the query failing, after which executeQuery drops it so the
        // next call reconnects — see QueryExecutor.
        if (mc.c == null) {
            mc.c = connect(mc);
        }
        return mc.c;
    }

    public String testConnection(String host, int port) {
        return testConnection(host, port, null, null);
    }

    public String testConnection(String host, int port, String username, String password) {
        // A single, clean kdb+ connect+close. The c constructor already applies a
        // connect timeout AND a handshake read timeout, so a dead/hung host fails
        // fast without a separate raw TCP probe — which would double the
        // open/close churn the remote process sees on every status check.
        Object c = null;
        try {
            c = connect(host, port, username, password, false); // TLS tested separately
            return "{\"success\": true}";
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg == null) msg = "unreachable";
            msg = msg.replace("\\", "\\\\").replace("\"", "\\\"");
            return "{\"success\": false, \"error\": \"" + msg + "\"}";
        } finally {
            if (c != null) {
                try { c.getClass().getMethod("close").invoke(c); } catch (Exception ignored) {}
            }
        }
    }

    public List<Map<String, Object>> getAllConnectionInfo() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (ManagedConnection mc : connections.values()) {
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("id", mc.id);
            info.put("name", mc.name);
            info.put("host", mc.host);
            info.put("port", mc.port);
            info.put("username", mc.username != null ? mc.username : "");
            info.put("group", mc.group != null ? mc.group : "");
            // Don't call isConnected() here — the ping blocks on dead hosts.
            // Just check if we have an active connection object.
            info.put("status", mc.c != null ? "connected" : "disconnected");
            result.add(info);
        }
        return result;
    }

    /**
     * Full connection info INCLUDING secrets (password, useTls) — for persistence
     * only. getAllConnectionInfo() omits these because it also feeds the API
     * response; saving with it silently dropped passwords, so all save paths must
     * use this method instead.
     */
    public List<Map<String, Object>> getAllConnectionsForSave() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (ManagedConnection mc : connections.values()) {
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("id", mc.id);
            info.put("name", mc.name);
            info.put("host", mc.host);
            info.put("port", mc.port);
            info.put("username", mc.username != null ? mc.username : "");
            info.put("password", mc.password != null ? mc.password : "");
            info.put("group", mc.group != null ? mc.group : "");
            info.put("useTls", mc.useTls);
            result.add(info);
        }
        return result;
    }

    /** Move a connection to a different folder/group (null or "" = ungrouped). */
    public boolean setGroup(String id, String group) {
        ManagedConnection mc = connections.get(id);
        if (mc == null) return false;
        mc.group = (group == null || group.isEmpty()) ? null : group;
        return true;
    }

    public void disconnect(String connId) {
        ManagedConnection mc = connections.get(connId);
        if (mc != null && mc.c != null) {
            try { mc.c.getClass().getMethod("close").invoke(mc.c); } catch (Exception ignored) {}
            mc.c = null;
        }
    }

    public void disconnectAll() {
        for (ManagedConnection mc : connections.values()) {
            if (mc.c != null) {
                try { mc.c.getClass().getMethod("close").invoke(mc.c); } catch (Exception ignored) {}
                mc.c = null;
            }
        }
    }

    // -- internal --

    private static Object connect(ManagedConnection mc) throws IOException {
        return connect(mc.host, mc.port, mc.username, mc.password, mc.useTls);
    }

    private static final int CONNECT_TIMEOUT_MS = 3000;

    private static Object connect(String host, int port,
                                   String username, String password, boolean useTls) throws IOException {
        try {
            Class<?> cClass = Class.forName("com.kx.c");
            String up = (username != null && !username.isEmpty())
                    ? username + ":" + (password != null ? password : "")
                    : "";
            Object conn = cClass.getConstructor(String.class, int.class, String.class,
                        boolean.class, int.class)
                    .newInstance(host, port, up, useTls, CONNECT_TIMEOUT_MS);
            // c.java sets the socket's read timeout to the connect timeout. Clear it
            // (0 = infinite) so long-running queries don't throw "Read timed out" —
            // which would also leave the socket desynced and return stale results.
            try {
                Object sock = cClass.getField("s").get(conn);
                if (sock instanceof java.net.Socket) ((java.net.Socket) sock).setSoTimeout(0);
            } catch (Exception ignored) { /* best effort — field/socket may differ */ }
            return conn;
        } catch (ClassNotFoundException e) {
            throw new IOException(
                    "com.kx.c not found on classpath. " +
                    "Copy c.java from KxSystems/javakdb into the project.", e);
        } catch (Exception e) {
            throw new IOException("Failed to connect to " + host + ":" + port +
                    ": " + e.getMessage(), e);
        }
    }

}
