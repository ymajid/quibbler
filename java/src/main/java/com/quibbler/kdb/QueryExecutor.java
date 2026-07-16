package com.quibbler.kdb;

import java.io.IOException;
import java.sql.Date;
import java.sql.Time;
import java.sql.Timestamp;
import java.util.*;
import java.util.concurrent.*;

/**
 * Executes q queries against a kdb+ process via c.java and returns
 * JSON-serialized results.
 */
public class QueryExecutor {

    private final ConnectionManager connectionManager;
    private final TypeMapper typeMapper;
    private volatile String currentQueryConnId;  // set during active query, null otherwise

    /** Query timeout in seconds; 0 = no timeout. Configurable via -Dquibbler.queryTimeout=N */
    private final int queryTimeoutSeconds;

    // Single-thread executor for query timeout enforcement
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "quibbler-query");
        t.setDaemon(true);
        return t;
    });

    public QueryExecutor(ConnectionManager connectionManager, TypeMapper typeMapper) {
        this.connectionManager = connectionManager;
        this.typeMapper = typeMapper;
        int timeout = 0;
        try { timeout = Integer.parseInt(System.getProperty("quibbler.queryTimeout", "0")); } catch (NumberFormatException ignored) {}
        this.queryTimeoutSeconds = timeout;
    }

    /** Cancel the currently running query by disconnecting its connection. */
    public void cancelQuery() {
        String connId = currentQueryConnId;
        if (connId != null) {
            connectionManager.disconnect(connId);
        }
    }

    /**
     * Execute a q query synchronously and return the result as a JSON string.
     *
     * @param connId    the connection ID from ConnectionManager
     * @param queryText the q expression to evaluate
     * @return JSON string with shape:
     *         { "type": "table"|"dict"|"list"|"atom"|"error", ... }
     */
    // synchronized: kdb+ c objects aren't thread-safe, so only one query/workspace
    // call touches a (persistent) connection at a time. cancelQuery is deliberately
    // NOT synchronized so it can abort a running query by closing the socket.
    public synchronized String executeQuery(String connId, String queryText) {
        Object c;
        try {
            c = connectionManager.getConnection(connId);
        } catch (IOException e) {
            return errorJson("Connection failed: " + e.getMessage());
        } catch (IllegalArgumentException e) {
            return errorJson("Unknown connection: " + e.getMessage());
        }

        if (c == null) {
            return errorJson("No connection available");
        }

        Object result;
        long serverMs;
        try {
            currentQueryConnId = connId;
            long t0 = System.nanoTime();

            // Execute c.k() — with optional timeout
            Object cRef = c;
            if (queryTimeoutSeconds > 0) {
                Future<Object> future = executor.submit(() ->
                    cRef.getClass().getMethod("k", String.class).invoke(cRef, queryText));
                try {
                    result = future.get(queryTimeoutSeconds, TimeUnit.SECONDS);
                } catch (TimeoutException e) {
                    connectionManager.disconnect(connId);
                    return errorJson("Query timed out after " + queryTimeoutSeconds + "s");
                }
            } else {
                result = cRef.getClass().getMethod("k", String.class).invoke(cRef, queryText);
            }

            serverMs = (System.nanoTime() - t0) / 1_000_000;
        } catch (Exception e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            // A kdb+ error (KException, e.g. 'type) is a normal result and leaves
            // the stream intact. Any other failure (IO/socket/EOF) may have left
            // the socket desynced, so drop it — the next query reconnects clean and
            // won't return a stale/previous result.
            boolean kdbError = "KException".equals(cause.getClass().getSimpleName());
            if (!kdbError) connectionManager.disconnect(connId);
            String msg = cause.getMessage();
            if (msg == null || msg.isEmpty()) msg = cause.getClass().getSimpleName();
            // Check if we were cancelled (connection closed from cancelQuery)
            return errorJson(msg.contains("close") || msg.contains("Socket") ? "Query cancelled" : msg);
        } finally {
            currentQueryConnId = null;
        }

        if (result == null) {
            return "{\"type\": \"atom\", \"v\": null, \"vt\": \"null\", \"_serverMs\": 0}";
        }

        try {
            Map<String, Object> typed = typeMapper.walk(result);
            String json = typeMapper.toJson(typed);

            // If this is a projection where the function name couldn't be determined
            // (c.java returns "func" for primitives), try to infer from the query text.
            if (result != null && result.getClass().getName().equals("com.kx.c$Projection")) {
                json = postProcessProjection(json, queryText);
            }

            // Inject server timing into the JSON
            json = json.substring(0, json.length() - 1) + ",\"_serverMs\":" + serverMs + "}";

            return json;
        } catch (Exception e) {
            return errorJson("Type mapping error: " + e.getMessage());
        }
    }

    /**
     * Try to infer the function name from the query text when c.java can't
     * determine it (projections of primitives return "func").
     * E.g., "1+" → "+[1]", "2*" → "*[2]"
     */
    private static String postProcessProjection(String json, String query) {
        if (query == null || query.trim().isEmpty()) return json;

        String q = query.trim();

        // Pattern: NUMBER OPERATOR  (e.g., "1+", "2*", "3%")
        // Match: optional digits followed by a single operator character
        if (q.matches(".*[+\\-*%|&^~<>=!@#$?:]+")) {
            // Extract the last operator character
            char lastOp = 0;
            for (int i = q.length() - 1; i >= 0; i--) {
                char c = q.charAt(i);
                if ("+\\-*%|&^~<>=!@#$?:".indexOf(c) >= 0) {
                    lastOp = c;
                    break;
                }
            }

            if (lastOp != 0) {
                // Find the argument before the operator
                String prefix = q.substring(0, q.lastIndexOf(lastOp)).trim();
                if (!prefix.isEmpty()) {
                    String replacement = "\"v\":\"" + lastOp + "[" + prefix + "]\"";
                    json = json.replaceFirst("\"v\":\"λ\\[[^]]*\\]\"", replacement);
                }
            }
        }

        // Pattern: OPERATOR[args]  (already in projection form)
        if (q.matches(".*\\[.*\\]")) {
            String replacement = "\"v\":\"" + escJson(q) + "\"";
            json = json.replaceFirst("\"v\":\"λ\\[[^]]*\\]\"", replacement);
        }

        return json;
    }

    private static String escJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    /** Run a k() query, returning null on any failure instead of throwing. */
    private static Object safeK(Object c, String query) {
        try {
            return c.getClass().getMethod("k", String.class).invoke(c, query);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Query the connected kdb+ process for workspace context (tables, columns,
     * functions, variables) to power autocomplete.
     */
    public synchronized String getWorkspaceContext(String connId) {
        Object c;
        try {
            c = connectionManager.getConnection(connId);
        } catch (Exception e) {
            return "{\"tables\":{},\"functions\":[],\"variables\":[]}";
        }

        try {
            // Each sub-query runs independently: if one fails (e.g. the type
            // lookup on an odd q build), we still return the tables/columns the
            // others produced instead of blanking the whole schema explorer.
            Object tableDict = safeK(c, "tables[]!cols each tables[]");
            // dict of table name → char vector of column types (in column order)
            Object typeDict = safeK(c, "tables[]!{exec t from meta x} each tables[]");
            Object funcs = safeK(c, "system \"f\"");
            Object vars = safeK(c, "system \"v\"");

            Map<String, Object> result = new LinkedHashMap<>();

            // Parse column types: Map<tableName, String[] (type chars)>
            Map<String, String[]> tableTypes = new LinkedHashMap<>();
            if (typeDict != null && typeDict.getClass().getName().equals("com.kx.c$Dict")) {
                java.lang.reflect.Field xField = typeDict.getClass().getField("x");
                java.lang.reflect.Field yField = typeDict.getClass().getField("y");
                Object tKeys = xField.get(typeDict);
                Object tVals = yField.get(typeDict);
                if (tKeys instanceof String[] && tVals != null && tVals.getClass().isArray()) {
                    String[] tNames = (String[]) tKeys;
                    int tLen = java.lang.reflect.Array.getLength(tVals);
                    for (int i = 0; i < tNames.length && i < tLen; i++) {
                        Object typeArr = java.lang.reflect.Array.get(tVals, i);
                        if (typeArr instanceof char[]) {
                            String[] typeStrings = new String[((char[]) typeArr).length];
                            for (int j = 0; j < typeStrings.length; j++) {
                                typeStrings[j] = typeCharToName(((char[]) typeArr)[j]);
                            }
                            tableTypes.put(tNames[i], typeStrings);
                        }
                    }
                }
            }

            // Parse table→columns dict, merging with types
            Map<String, Object> tableMap = new LinkedHashMap<>();
            if (tableDict != null && tableDict.getClass().getName().equals("com.kx.c$Dict")) {
                java.lang.reflect.Field xField = tableDict.getClass().getField("x");
                java.lang.reflect.Field yField = tableDict.getClass().getField("y");
                Object keys = xField.get(tableDict);
                Object values = yField.get(tableDict);

                if (keys instanceof String[]) {
                    String[] tableNames = (String[]) keys;
                    if (values != null && values.getClass().isArray()) {
                        int len = java.lang.reflect.Array.getLength(values);
                        for (int i = 0; i < tableNames.length && i < len; i++) {
                            Object colObj = java.lang.reflect.Array.get(values, i);
                            String[] colNames = null;
                            if (colObj instanceof String[]) {
                                colNames = (String[]) colObj;
                            } else if (colObj != null && colObj.getClass().isArray()
                                    && colObj.getClass().getComponentType() == char.class) {
                                colNames = new String[]{new String(new char[]{(char) java.lang.reflect.Array.get(colObj, 0)})};
                            }
                            if (colNames != null) {
                                String[] types = tableTypes.get(tableNames[i]);
                                List<Map<String, String>> colList = new ArrayList<>();
                                for (int j = 0; j < colNames.length; j++) {
                                    Map<String, String> colInfo = new LinkedHashMap<>();
                                    colInfo.put("name", colNames[j]);
                                    colInfo.put("type", types != null && j < types.length ? types[j] : "?");
                                    colList.add(colInfo);
                                }
                                tableMap.put(tableNames[i], colList);
                            }
                        }
                    }
                }
            }
            result.put("tables", tableMap);

            // Parse function names
            List<String> funcList = new ArrayList<>();
            if (funcs instanceof String[]) {
                funcList.addAll(java.util.Arrays.asList((String[]) funcs));
            }
            result.put("functions", funcList);

            // Parse variable names
            List<String> varList = new ArrayList<>();
            if (vars instanceof String[]) {
                varList.addAll(java.util.Arrays.asList((String[]) vars));
            }
            result.put("variables", varList);

            return typeMapper.toJson(result);

        } catch (Exception e) {
            return "{\"tables\":{},\"functions\":[],\"variables\":[]}";
        }
    }

    /** Map kdb type char to human-readable name. */
    private static String typeCharToName(char t) {
        switch (t) {
            case 'b': return "boolean"; case 'g': return "guid"; case 'x': return "byte";
            case 'h': return "short"; case 'i': return "int"; case 'j': return "long";
            case 'e': return "real"; case 'f': return "float"; case 'c': return "char";
            case 's': return "symbol"; case 'p': return "timestamp"; case 'm': return "month";
            case 'd': return "date"; case 'z': return "datetime"; case 'n': return "timespan";
            case 'u': return "minute"; case 'v': return "second"; case 't': return "time";
            case 'C': return "string"; case ' ': return "list";
            default: return String.valueOf(t);
        }
    }

    private static String errorJson(String message) {
        if (message == null || message.isEmpty()) {
            return "{\"type\": \"error\", \"message\": \"Unknown error\"}";
        }
        String escaped = message
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
        return "{\"type\": \"error\", \"message\": \"" + escaped + "\"}";
    }
}
