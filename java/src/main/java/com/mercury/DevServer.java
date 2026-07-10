package com.mercury;

import com.mercury.config.ConfigManager;
import com.mercury.files.FileBrowser;
import com.mercury.kdb.ConnectionManager;
import com.mercury.kdb.QueryExecutor;
import com.mercury.kdb.TypeMapper;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/**
 * Lightweight HTTP server for development. Serves the frontend and exposes a
 * REST API for kdb+ queries. Launches Chrome in app mode for a native desktop feel.
 *
 * API:
 *   POST /api/query?connId=X          body = raw q query text
 *   GET  /api/connections
 *   POST /api/connections             body = JSON {name, host, port, username, password}
 *   POST /api/connections/delete      body = JSON {id}
 *   POST /api/testConnection          body = JSON {host, port, username, password}
 *   POST /api/files                   body = JSON {path}
 *   POST /api/readFile                body = JSON {path}
 *   POST /api/saveFile                body = JSON {path, content}
 *   GET  /api/history
 */
public class DevServer {

    private final ConnectionManager connectionManager;
    private final QueryExecutor queryExecutor;
    private final TypeMapper typeMapper;
    private final ConfigManager configManager;
    private final FileBrowser fileBrowser;

    public DevServer() {
        this.connectionManager = new ConnectionManager();
        this.typeMapper = new TypeMapper();
        this.queryExecutor = new QueryExecutor(connectionManager, typeMapper);
        this.configManager = new ConfigManager();
        this.fileBrowser = new FileBrowser();

        configManager.loadConnections().forEach(c ->
            connectionManager.addConnection(c.id, c.name, c.host, c.port,
                    c.username, c.password, c.group, c.useTls));
    }

    public void start(int port) throws IOException {
        // Bind the requested port, or the next free one if it's taken, so a
        // stray earlier instance never blocks startup.
        HttpServer srv = null;
        int bound = port;
        for (int attempt = 0; attempt < 12 && srv == null; attempt++) {
            try {
                srv = HttpServer.create(new InetSocketAddress("127.0.0.1", bound), 0);
            } catch (IOException e) {
                bound++;
            }
        }
        if (srv == null) throw new IOException("No free port found near " + port);
        final HttpServer server = srv;  // effectively final for the shutdown hook

        server.createContext("/api/", new ApiHandler());
        server.createContext("/", new StaticHandler());
        server.setExecutor(null);
        server.start();

        String url = "http://127.0.0.1:" + bound;
        System.out.println();
        System.out.println("  mercury — kdb+/q IDE");
        System.out.println("  Running at " + url);
        System.out.println("  Press Ctrl+C to stop.");
        System.out.println();

        openBrowser(url);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(0)));
    }

    /**
     * Open the app in Chrome's app-mode (a clean, chromeless window) when Chrome
     * is available, otherwise fall back to the system default browser. Set the
     * MERCURY_NO_BROWSER environment variable to skip launching entirely.
     */
    private static void openBrowser(String url) {
        if (System.getenv("MERCURY_NO_BROWSER") != null) {
            System.out.println("  MERCURY_NO_BROWSER set — open " + url + " yourself.");
            return;
        }
        String os = System.getProperty("os.name", "").toLowerCase();
        try {
            if (os.contains("win")) {
                String chrome = findWindowsChrome();
                if (chrome != null) {
                    new ProcessBuilder(chrome, "--new-window", "--app=" + url, "--window-size=1400,900").start();
                    return;
                }
            } else if (os.contains("mac")) {
                try {
                    new ProcessBuilder("open", "-n", "-a", "Google Chrome", "--args",
                            "--new-window", "--app=" + url, "--window-size=1400,900").start();
                    return;
                } catch (IOException ignored) { /* fall through to default browser */ }
            } else {
                for (String c : new String[]{"google-chrome", "google-chrome-stable", "chromium", "chromium-browser"}) {
                    try {
                        new ProcessBuilder(c, "--new-window", "--app=" + url, "--window-size=1400,900").start();
                        return;
                    } catch (IOException ignored) { /* try the next candidate */ }
                }
            }
        } catch (IOException ignored) { /* fall through to default browser */ }
        openDefault(url, os);
    }

    private static String findWindowsChrome() {
        for (String env : new String[]{"ProgramFiles", "ProgramFiles(x86)", "LocalAppData"}) {
            String base = System.getenv(env);
            if (base == null) continue;
            File exe = new File(base, "Google\\Chrome\\Application\\chrome.exe");
            if (exe.exists()) return exe.getAbsolutePath();
        }
        return null;
    }

    private static void openDefault(String url, String os) {
        // Use the OS shell to open the default browser — no java.desktop needed,
        // which keeps the bundled (jpackage) runtime small.
        try {
            if (os.contains("win")) new ProcessBuilder("cmd", "/c", "start", "", url).start();
            else if (os.contains("mac")) new ProcessBuilder("open", url).start();
            else new ProcessBuilder("xdg-open", url).start();
        } catch (IOException e) {
            System.out.println("  Could not open a browser — visit " + url + " manually.");
        }
    }

    // ---- API Handler ----

    class ApiHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod();
            addCors(exchange);

            // Handle CORS preflight
            if ("OPTIONS".equals(method)) {
                exchange.sendResponseHeaders(204, -1);
                exchange.close();
                return;
            }

            try {
                String result;
                switch (path) {
                    case "/api/query":
                        result = handleQuery(exchange); break;
                    case "/api/connections":
                        result = handleConnections(method, exchange); break;
                    case "/api/connections/delete":
                        result = handleDeleteConnection(exchange); break;
                    case "/api/testConnection":
                        result = handleTestConnection(exchange); break;
                    case "/api/files":
                        result = handleListFiles(exchange); break;
                    case "/api/readFile":
                        result = handleReadFile(exchange); break;
                    case "/api/saveFile":
                        result = handleSaveFile(exchange); break;
                    case "/api/history":
                        result = handleGetHistory(); break;
                    case "/api/workspace":
                        result = handleWorkspace(exchange); break;
                    case "/api/cancel":
                        result = handleCancel(); break;
                    default:
                        result = "{\"error\":\"Unknown: " + path + "\"}";
                }

                byte[] bytes = result.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                exchange.getResponseBody().write(bytes);

            } catch (Exception e) {
                String msg = e.getMessage();
                String err = "{\"error\":\"" + (msg != null ? esc(msg) : e.getClass().getSimpleName()) + "\"}";
                byte[] bytes = err.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                addCors(exchange);
                exchange.sendResponseHeaders(500, bytes.length);
                exchange.getResponseBody().write(bytes);
            } finally {
                exchange.close();
            }
        }

        // Query: raw body text, connId from query param
        private String handleQuery(HttpExchange exchange) throws IOException {
            String connId = getQueryParam(exchange, "connId");
            String query = readBody(exchange);
            if (connId == null) return "{\"type\":\"error\",\"message\":\"Missing connId parameter\"}";
            String result = queryExecutor.executeQuery(connId, query);

            // Parse result to extract status + rowCount + serverMs for history
            String status = "ok";
            int rowCount = 0;
            long duration = 0;
            String errorMessage = null;
            try {
                Map<String, Object> parsed = parseJsonDeep(result);
                // Use _serverMs from the response (c.k() IPC timing) — same as status bar
                Object srvMs = parsed.get("_serverMs");
                if (srvMs instanceof Number) duration = ((Number) srvMs).longValue();
                if ("error".equals(parsed.get("type"))) {
                    status = "error";
                    errorMessage = parsed.get("message") != null ? parsed.get("message").toString() : "Unknown error";
                } else if ("table".equals(parsed.get("type"))) {
                    Object rc = parsed.get("rowCount");
                    if (rc instanceof Number) rowCount = ((Number) rc).intValue();
                } else if ("dict".equals(parsed.get("type"))) {
                    // Keyed table: values is a table → use its rowCount; else use key list length
                    Object values = parsed.get("values");
                    Map<String, Object> valuesMap = toMap(values);
                    if (valuesMap != null && "table".equals(valuesMap.get("type"))) {
                        Object rc = valuesMap.get("rowCount");
                        if (rc instanceof Number) rowCount = ((Number) rc).intValue();
                    } else {
                        Object keys = parsed.get("keys");
                        Map<String, Object> keysMap = toMap(keys);
                        if (keysMap != null && "list".equals(keysMap.get("type"))) {
                            Object len = keysMap.get("length");
                            if (len instanceof Number) rowCount = ((Number) len).intValue();
                        } else {
                            rowCount = 1;
                        }
                    }
                } else if ("list".equals(parsed.get("type"))) {
                    Object len = parsed.get("length");
                    if (len instanceof Number) rowCount = ((Number) len).intValue();
                } else {
                    rowCount = 1;
                }
            } catch (Exception ignored) {}

            configManager.addHistoryEntry(query, connId, status, rowCount, duration, errorMessage);
            return result;
        }

        private String handleConnections(String method, HttpExchange exchange) throws IOException {
            if ("POST".equals(method)) {
                Map<String, Object> p = parseJson(readBody(exchange));
                String name = str(p, "name", "Unnamed");
                String host = str(p, "host", "localhost");
                int port = num(p, "port", 5000);
                String username = str(p, "username", null);
                String password = str(p, "password", null);
                String group = str(p, "group", null);
                boolean useTls = p.get("useTls") instanceof Boolean && (Boolean) p.get("useTls");
                if (username != null && username.isEmpty()) username = null;
                if (password != null && password.isEmpty()) password = null;
                if (group != null && group.isEmpty()) group = null;

                String id = connectionManager.addConnection(name, host, port,
                        username, password, group, useTls);
                configManager.saveConnections(connectionManager.getAllConnectionInfo());
                return "{\"id\":\"" + id + "\"}";
            }
            return typeMapper.toJson(connectionManager.getAllConnectionInfo());
        }

        private String handleDeleteConnection(HttpExchange exchange) throws IOException {
            Map<String, Object> p = parseJson(readBody(exchange));
            connectionManager.removeConnection(str(p, "id", ""));
            configManager.saveConnections(connectionManager.getAllConnectionInfo());
            return "{\"ok\":true}";
        }

        private String handleTestConnection(HttpExchange exchange) throws IOException {
            Map<String, Object> p = parseJson(readBody(exchange));
            String host = str(p, "host", "localhost");
            int port = num(p, "port", 5000);
            String u = str(p, "username", null);
            String pw = str(p, "password", null);
            return connectionManager.testConnection(host, port, u, pw);
        }

        private String handleListFiles(HttpExchange exchange) throws IOException {
            Map<String, Object> p = parseJson(readBody(exchange));
            return fileBrowser.listDirectory(str(p, "path", "."));
        }

        private String handleReadFile(HttpExchange exchange) throws IOException {
            Map<String, Object> p = parseJson(readBody(exchange));
            return "{\"content\":" + jsonStr(fileBrowser.readFile(str(p, "path", ""))) + "}";
        }

        private String handleSaveFile(HttpExchange exchange) throws IOException {
            Map<String, Object> p = parseJson(readBody(exchange));
            try {
                fileBrowser.saveFile(str(p, "path", ""), str(p, "content", ""));
                return "{\"ok\":true}";
            } catch (IOException e) {
                return "{\"error\":\"" + esc(e.getMessage()) + "\"}";
            }
        }

        private String handleGetHistory() {
            return typeMapper.toJson(configManager.loadQueryHistory());
        }

        private String handleWorkspace(HttpExchange exchange) {
            String connId = getQueryParam(exchange, "connId");
            if (connId == null) return "{\"tables\":{},\"functions\":[],\"variables\":[]}";
            return queryExecutor.getWorkspaceContext(connId);
        }

        private String handleCancel() {
            queryExecutor.cancelQuery();
            return "{\"ok\":true}";
        }
    }

    // ---- Static File Handler ----

    /**
     * Serves the built frontend. In a dev checkout it reads from frontend/dist on
     * disk; in the packaged JAR it reads the same files from the classpath
     * (bundled under /frontend), so a single self-contained jar serves the whole
     * app. Unknown non-API paths fall back to index.html (SPA routing).
     */
    class StaticHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/") || path.isEmpty()) path = "/index.html";

            byte[] bytes = (path.contains("..")) ? null : readStatic(path);
            String servedPath = path;
            if (bytes == null && !path.startsWith("/api/")) {
                bytes = readStatic("/index.html");   // SPA fallback
                servedPath = "/index.html";
            }

            if (bytes != null) {
                exchange.getResponseHeaders().set("Content-Type", contentType(servedPath));
                exchange.sendResponseHeaders(200, bytes.length);
                exchange.getResponseBody().write(bytes);
            } else {
                exchange.sendResponseHeaders(404, -1);
            }
            exchange.close();
        }
    }

    /** Read a static asset from disk (dev) or the classpath (packaged jar). */
    private static byte[] readStatic(String path) {
        // Dev: frontend/dist, then the source frontend/ dir, relative to CWD.
        try {
            Path f = Paths.get("frontend/dist" + path);
            if (!Files.exists(f)) f = Paths.get("frontend" + path);
            if (Files.exists(f) && !Files.isDirectory(f)) return Files.readAllBytes(f);
        } catch (Exception ignored) { /* not on disk — try the classpath */ }
        // Packaged: bundled under /frontend inside the jar.
        try (InputStream is = DevServer.class.getResourceAsStream("/frontend" + path)) {
            if (is != null) return is.readAllBytes();
        } catch (Exception ignored) { /* not on the classpath either */ }
        return null;
    }

    // ---- JSON helpers ----

    /** Parse JSON with recursive depth for nested objects (unlike parseJson which keeps them as strings). */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> parseJsonDeep(String json) {
        Map<String, Object> flat = parseJson(json);
        Map<String, Object> deep = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : flat.entrySet()) {
            Object v = e.getValue();
            if (v instanceof String && (((String) v).startsWith("{") || ((String) v).startsWith("["))) {
                try {
                    deep.put(e.getKey(), parseJsonDeep((String) v));
                } catch (Exception ex) {
                    deep.put(e.getKey(), v);
                }
            } else {
                deep.put(e.getKey(), v);
            }
        }
        return deep;
    }

    /** Convert a value to Map, handling both Map and String (JSON) types. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> toMap(Object v) {
        if (v instanceof Map) return (Map<String, Object>) v;
        if (v instanceof String) {
            try { return parseJson((String) v); } catch (Exception e) { return null; }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> parseJson(String json) {
        Map<String, Object> map = new LinkedHashMap<>();
        if (json == null || json.trim().isEmpty()) return map;

        // Simple recursive-descent JSON parser (handles escaped quotes)
        String s = json.trim();
        if (s.startsWith("{")) s = s.substring(1);
        if (s.endsWith("}")) s = s.substring(0, s.length() - 1);

        int i = 0;
        while (i < s.length()) {
            // Skip whitespace
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
            if (i >= s.length()) break;
            if (s.charAt(i) == ',') { i++; continue; }

            // Read key
            String key = readJsonString(s, i);
            i += key.length() + 2; // skip quotes around key
            while (i < s.length() && s.charAt(i) != ':') i++;
            i++; // skip colon
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;

            // Read value
            if (i < s.length()) {
                Object value;
                if (s.charAt(i) == '"') {
                    String v = readJsonString(s, i);
                    i += v.length() + 2;
                    value = v;
                } else if (s.charAt(i) == '{' || s.charAt(i) == '[') {
                    int depth = 1;
                    int start = i;
                    i++;
                    while (i < s.length() && depth > 0) {
                        if (s.charAt(i) == '"') { i++; while (i < s.length() && s.charAt(i) != '"') { if (s.charAt(i) == '\\') i++; i++; } }
                        else if (s.charAt(i) == '{' || s.charAt(i) == '[') depth++;
                        else if (s.charAt(i) == '}' || s.charAt(i) == ']') depth--;
                        i++;
                    }
                    value = s.substring(start, i); // nested — keep as string
                } else if (s.startsWith("true", i)) {
                    value = Boolean.TRUE;
                    i += 4;
                } else if (s.startsWith("false", i)) {
                    value = Boolean.FALSE;
                    i += 5;
                } else if (s.startsWith("null", i)) {
                    value = null;
                    i += 4;
                } else if (Character.isDigit(s.charAt(i)) || s.charAt(i) == '-') {
                    int start = i;
                    while (i < s.length() && (Character.isDigit(s.charAt(i)) || s.charAt(i) == '.' || s.charAt(i) == '-' || s.charAt(i) == 'e' || s.charAt(i) == 'E' || s.charAt(i) == '+')) i++;
                    String numStr = s.substring(start, i);
                    try {
                        if (numStr.contains(".") || numStr.contains("e") || numStr.contains("E")) {
                            value = Double.parseDouble(numStr);
                        } else {
                            value = Long.parseLong(numStr);
                        }
                    } catch (NumberFormatException e) {
                        value = Double.parseDouble(numStr);
                    }
                } else {
                    i++;
                    continue;
                }
                map.put(key, value);
            }
        }
        return map;
    }

    private static String readJsonString(String s, int start) {
        if (start >= s.length() || s.charAt(start) != '"') return "";
        StringBuilder sb = new StringBuilder();
        int i = start + 1;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == '"') break;
            if (c == '\\') { i++; if (i < s.length()) sb.append(s.charAt(i)); i++; }
            else { sb.append(c); i++; }
        }
        return sb.toString();
    }

    private static String str(Map<String, Object> m, String key, String def) {
        Object v = m.get(key);
        return v instanceof String ? (String) v : def;
    }

    private static int num(Map<String, Object> m, String key, int def) {
        Object v = m.get(key);
        if (v instanceof Integer) return (Integer) v;
        if (v instanceof String) {
            try { return Integer.parseInt((String) v); } catch (NumberFormatException e) { return def; }
        }
        return def;
    }

    // ---- Utilities ----

    private static String readBody(HttpExchange exchange) throws IOException {
        try (InputStream is = exchange.getRequestBody()) {
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String getQueryParam(HttpExchange exchange, String name) {
        String query = exchange.getRequestURI().getQuery();
        if (query == null) return null;
        for (String pair : query.split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2 && kv[0].equals(name)) {
                return URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static void addCors(HttpExchange exchange) {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
    }

    private static String jsonStr(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default: sb.append(c);
            }
        }
        return sb.append("\"").toString();
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String contentType(String path) {
        if (path.endsWith(".html")) return "text/html; charset=utf-8";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json") || path.endsWith(".map")) return "application/json";
        if (path.endsWith(".ttf")) return "font/ttf";
        if (path.endsWith(".woff")) return "font/woff";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".gif")) return "image/gif";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".ico")) return "image/x-icon";
        if (path.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }

    // ---- Main ----

    public static void main(String[] args) {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8090;
        try {
            new DevServer().start(port);
        } catch (IOException e) {
            System.err.println("Failed to start: " + e.getMessage());
            System.exit(1);
        }
    }
}
