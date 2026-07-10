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
        final String group;
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
        if (mc.c == null || !isConnected(mc)) {
            mc.c = connect(mc);
        }
        return mc.c;
    }

    public String testConnection(String host, int port) {
        return testConnection(host, port, null, null);
    }

    public String testConnection(String host, int port, String username, String password) {
        // First, do a fast TCP check with a short connect timeout.
        // c.java's setSoTimeout is for reads, not the connect itself.
        java.net.Socket probe = null;
        try {
            probe = new java.net.Socket();
            probe.connect(new java.net.InetSocketAddress(host, port), 2000);
        } catch (Exception e) {
            return "{\"success\": false, \"error\": \"Cannot reach " + host + ":" + port + " — " + e.getMessage() + "\"}";
        } finally {
            if (probe != null) { try { probe.close(); } catch (Exception ignored) {} }
        }

        // TCP is reachable — now try the full kdb+ handshake
        Object c = null;
        try {
            c = connect(host, port, username, password, false); // TLS tested separately
            return "{\"success\": true}";
        } catch (Exception e) {
            return "{\"success\": false, \"error\": \"" + e.getMessage() + "\"}";
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
            return cClass.getConstructor(String.class, int.class, String.class,
                        boolean.class, int.class)
                    .newInstance(host, port, up, useTls, CONNECT_TIMEOUT_MS);
        } catch (ClassNotFoundException e) {
            throw new IOException(
                    "com.kx.c not found on classpath. " +
                    "Copy c.java from KxSystems/javakdb into the project.", e);
        } catch (Exception e) {
            throw new IOException("Failed to connect to " + host + ":" + port +
                    ": " + e.getMessage(), e);
        }
    }

    private static boolean isConnected(ManagedConnection mc) {
        if (mc.c == null) return false;
        try {
            // Send a simple ping to verify the connection is alive
            mc.c.getClass().getMethod("k", String.class).invoke(mc.c, "1");
            return true;
        } catch (Exception e) {
            // Connection is dead — close and clear it
            try { mc.c.getClass().getMethod("close").invoke(mc.c); } catch (Exception ignored) {}
            mc.c = null;
            return false;
        }
    }
}
