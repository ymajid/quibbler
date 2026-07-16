package com.quibbler.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.*;

/**
 * Reads and writes persisted configuration: connections and query history.
 *
 * Uses JSONL (one JSON object per line) for history to avoid fragile
 * array parsing. Connections use a JSON array written/read via TypeMapper.
 */
public class ConfigManager {

    private final Path configDir;

    public ConfigManager() {
        this(defaultConfigDir());
    }

    /**
     * ~/.quibbler, migrating a pre-rename ~/.mercury directory on first run so
     * existing saved connections and query history carry over. If both exist we
     * keep .quibbler untouched (already migrated / newer).
     */
    private static Path defaultConfigDir() {
        String home = System.getProperty("user.home");
        Path quibbler = Paths.get(home, ".quibbler");
        Path legacy = Paths.get(home, ".mercury");
        if (!Files.exists(quibbler) && Files.exists(legacy)) {
            try { Files.move(legacy, quibbler); } catch (IOException ignored) { /* fall through — start fresh */ }
        }
        return quibbler;
    }

    public ConfigManager(Path configDir) {
        this.configDir = configDir;
        try { Files.createDirectories(configDir); } catch (IOException ignored) {}
    }

    // ---- Connections ----

    public static class SavedConnection {
        public final String id;
        public final String name;
        public final String host;
        public final int port;
        public final String username;
        public final String password;
        public final String group;
        public final boolean useTls;

        public SavedConnection(String id, String name, String host, int port,
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

    public List<SavedConnection> loadConnections() {
        Path file = configDir.resolve("connections.json");
        if (!Files.exists(file)) return List.of();
        try {
            String raw = Files.readString(file);
            return parseConnections(raw);
        } catch (IOException e) {
            return List.of();
        }
    }

    public void saveConnections(List<Map<String, Object>> connections) {
        Path file = configDir.resolve("connections.json");
        StringBuilder sb = new StringBuilder("[\n");
        for (int i = 0; i < connections.size(); i++) {
            Map<String, Object> c = connections.get(i);
            sb.append("  {\"id\":\"").append(c.get("id")).append("\",");
            sb.append("\"name\":\"").append(esc(c.get("name"))).append("\",");
            sb.append("\"host\":\"").append(esc(c.get("host"))).append("\",");
            sb.append("\"port\":").append(c.get("port"));
            String uname = c.get("username") != null ? c.get("username").toString() : "";
            String pass = c.get("password") != null ? c.get("password").toString() : "";
            String group = c.get("group") != null ? c.get("group").toString() : "";
            if (uname != null && !uname.isEmpty()) {
                sb.append(",\"username\":\"").append(esc(uname)).append("\"");
            }
            if (pass != null && !pass.isEmpty()) {
                sb.append(",\"password\":\"").append(esc(pass)).append("\"");
            }
            if (group != null && !group.isEmpty()) {
                sb.append(",\"group\":\"").append(esc(group)).append("\"");
            }
            Object tls = c.get("useTls");
            if (tls instanceof Boolean && ((Boolean) tls)) {
                sb.append(",\"useTls\":true");
            }
            sb.append("}");
            if (i < connections.size() - 1) sb.append(",");
            sb.append("\n");
        }
        sb.append("]\n");
        try { Files.writeString(file, sb.toString()); } catch (IOException ignored) {}
    }

    // ---- Query History (JSONL: one entry per line) ----

    public static class HistoryEntry {
        public final String id;
        public final String query;
        public final String timestamp;
        public final String connectionId;
        public final String status;
        public final int rowCount;
        public final long durationMs;
        public final String errorMessage;

        public HistoryEntry(String id, String query, String timestamp, String connectionId,
                             String status, int rowCount, long durationMs, String errorMessage) {
            this.id = id;
            this.query = query;
            this.timestamp = timestamp;
            this.connectionId = connectionId;
            this.status = status;
            this.rowCount = rowCount;
            this.durationMs = durationMs;
            this.errorMessage = errorMessage;
        }
    }

    public List<Map<String, Object>> loadQueryHistory() {
        Path file = configDir.resolve("history.jsonl");
        if (!Files.exists(file)) return new ArrayList<>();
        List<Map<String, Object>> result = new ArrayList<>();
        try {
            for (String line : Files.readAllLines(file)) {
                line = line.trim();
                if (line.isEmpty()) continue;
                Map<String, Object> entry = parseJsonObject(line);
                if (entry != null) result.add(entry);
            }
        } catch (IOException e) { /* return empty */ }
        // Reverse: newest entries first (they're appended at the end)
        java.util.Collections.reverse(result);
        return result;
    }

    public void addHistoryEntry(String query, String connectionId,
                                  String status, int rowCount, long durationMs, String errorMessage) {
        Path file = configDir.resolve("history.jsonl");
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", UUID.randomUUID().toString().substring(0, 8));
        entry.put("query", query);
        entry.put("timestamp", java.time.Instant.now().toString());
        entry.put("connectionId", connectionId);
        entry.put("status", status);
        entry.put("rowCount", rowCount);
        entry.put("durationMs", durationMs);
        if (errorMessage != null && !errorMessage.isEmpty()) {
            entry.put("errorMessage", errorMessage);
        }

        String line = toJsonLine(entry) + "\n";
        try {
            Files.writeString(file, line, StandardOpenOption.CREATE,
                    StandardOpenOption.APPEND);
        } catch (IOException ignored) {}
    }

    // ---- JSON Helpers ----

    private List<SavedConnection> parseConnections(String raw) {
        List<SavedConnection> result = new ArrayList<>();
        String[] entries = splitJsonArray(raw);
        for (String entry : entries) {
            if (entry.isEmpty()) continue;
            Map<String, Object> m = parseJsonObject(entry);
            if (m != null) {
                String id = str(m, "id", "");
                String name = str(m, "name", "");
                String host = str(m, "host", "localhost");
                int port = num(m, "port", 5000);
                String uname = str(m, "username", null);
                String pass = str(m, "password", null);
                String group = str(m, "group", null);
                boolean useTls = m.get("useTls") instanceof Boolean && (Boolean) m.get("useTls");
                result.add(new SavedConnection(id, name, host, port, uname, pass, group, useTls));
            }
        }
        return result;
    }

    /**
     * Split a JSON array into individual object strings.
     * Handles strings containing braces by tracking depth.
     */
    private static String[] splitJsonArray(String raw) {
        raw = raw.trim();
        if (raw.startsWith("[")) raw = raw.substring(1);
        if (raw.endsWith("]")) raw = raw.substring(0, raw.length() - 1);

        List<String> parts = new ArrayList<>();
        int depth = 0, start = 0;
        boolean inString = false;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c == '"' && (i == 0 || raw.charAt(i - 1) != '\\')) inString = !inString;
            if (inString) continue;
            if (c == '{') depth++;
            else if (c == '}') depth--;
            else if (c == ',' && depth == 0) {
                parts.add(raw.substring(start, i).trim());
                start = i + 1;
            }
        }
        if (start < raw.length()) parts.add(raw.substring(start).trim());
        return parts.toArray(new String[0]);
    }

    /**
     * Parse a single JSON object string like {"key":"value","num":42}.
     * Handles escaped quotes and nested braces in values.
     */
    private Map<String, Object> parseJsonObject(String s) {
        s = s.trim();
        if (s.startsWith("{")) s = s.substring(1);
        if (s.endsWith("}")) s = s.substring(0, s.length() - 1);

        Map<String, Object> map = new LinkedHashMap<>();
        int i = 0;
        while (i < s.length()) {
            // Skip whitespace and commas
            while (i < s.length() && (Character.isWhitespace(s.charAt(i)) || s.charAt(i) == ',')) i++;
            if (i >= s.length()) break;

            // Read key. Advance by the RAW span (skipString), not the decoded
            // length — otherwise an escaped char in the value desyncs the index.
            String key = readJsonString(s, i);
            i = skipString(s, i);
            while (i < s.length() && s.charAt(i) != ':') i++;
            i++; // skip colon
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;

            // Read value
            if (i >= s.length()) break;
            Object value;
            char c = s.charAt(i);
            if (c == '"') {
                value = readJsonString(s, i);
                i = skipString(s, i);
            } else if (c == '{') {
                // Nested object — find matching close
                int depth = 1, start = i;
                i++;
                while (i < s.length() && depth > 0) {
                    if (s.charAt(i) == '"') { skipString(s, i); i = skipString(s, i); }
                    else if (s.charAt(i) == '{') depth++;
                    else if (s.charAt(i) == '}') depth--;
                    i++;
                }
                value = s.substring(start, i);
            } else if (Character.isDigit(c) || c == '-') {
                int start = i;
                while (i < s.length() && (Character.isDigit(s.charAt(i)) || s.charAt(i) == '.' || s.charAt(i) == '-')) i++;
                String numStr = s.substring(start, i);
                try {
                    value = numStr.contains(".") ? Double.parseDouble(numStr) : Long.parseLong(numStr);
                } catch (NumberFormatException e) {
                    value = numStr;
                }
            } else if (c == 't' || c == 'f') {
                value = s.startsWith("true", i);
                i += value.equals(Boolean.TRUE) ? 4 : 5;
            } else if (c == 'n') {
                value = null;
                i += 4;
            } else {
                i++;
                continue;
            }
            map.put(key, value);
        }
        return map.isEmpty() ? null : map;
    }

    private static String readJsonString(String s, int start) {
        if (start >= s.length() || s.charAt(start) != '"') return "";
        StringBuilder sb = new StringBuilder();
        int i = start + 1;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == '"') break;
            if (c == '\\' && i + 1 < s.length()) {
                char e = s.charAt(++i);
                switch (e) {
                    case 'n': sb.append('\n'); break;   // was appending 'n' — newlines came back as the letter n
                    case 't': sb.append('\t'); break;
                    case 'r': sb.append('\r'); break;
                    case 'b': sb.append('\b'); break;
                    case 'f': sb.append('\f'); break;
                    case '/': sb.append('/'); break;
                    case '"': sb.append('"'); break;
                    case '\\': sb.append('\\'); break;
                    case 'u':
                        if (i + 4 < s.length()) {
                            try { sb.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16)); i += 4; }
                            catch (NumberFormatException ignored) { sb.append(e); }
                        } else sb.append(e);
                        break;
                    default: sb.append(e);
                }
                i++;
            } else {
                sb.append(c);
                i++;
            }
        }
        return sb.toString();
    }

    private static int skipString(String s, int start) {
        int i = start + 1;
        while (i < s.length()) {
            if (s.charAt(i) == '\\') i += 2;
            else if (s.charAt(i) == '"') return i + 1;
            else i++;
        }
        return s.length();
    }

    private static String toJsonLine(Map<String, Object> m) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> e : m.entrySet()) {
            if (!first) sb.append(",");
            sb.append("\"").append(e.getKey()).append("\":");
            Object v = e.getValue();
            if (v instanceof String) sb.append("\"").append(esc((String) v)).append("\"");
            else sb.append(v);
            first = false;
        }
        sb.append("}");
        return sb.toString();
    }

    private static String str(Map<String, Object> m, String key, String def) {
        Object v = m.get(key);
        return v instanceof String ? (String) v : def;
    }

    private static int num(Map<String, Object> m, String key, int def) {
        Object v = m.get(key);
        if (v instanceof Long) return ((Long) v).intValue();
        if (v instanceof Double) return ((Double) v).intValue();
        if (v instanceof String) {
            try { return Integer.parseInt((String) v); } catch (NumberFormatException e) { return def; }
        }
        return def;
    }

    private static String esc(Object o) {
        if (o == null) return "";
        String s = o.toString();
        StringBuilder sb = new StringBuilder(s.length());
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
        return sb.toString();
    }
}
