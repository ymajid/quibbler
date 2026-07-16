package com.quibbler.kdb;

import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.sql.Date;
import java.sql.Time;
import java.sql.Timestamp;
import java.text.SimpleDateFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Recursively walks a kdb+ result object and converts it to a
 * JSON-serializable structure of Maps, Lists, and primitives.
 *
 * Each node in the result tree is annotated with a "type" field
 * so the frontend renderer knows how to display it:
 *
 *   atom        — scalar value
 *   list        — ordered collection
 *   dict        — key-value pairs (general dictionary)
 *   table       — flip / in-memory table
 *   keyedTable  — keyed table
 *   error       — query or connection error
 *
 * This class uses reflection extensively since the kx.c types
 * (c.Dict, c.Flip, c.Month, etc.) may not be on the compile-time classpath.
 */
public class TypeMapper {

    // kdb+ REPL date/time formats
    private static final SimpleDateFormat TIMESTAMP_FMT =
            new SimpleDateFormat("yyyy.MM.dd'D'HH:mm:ss.SSS");
    private static final SimpleDateFormat DATE_FMT =
            new SimpleDateFormat("yyyy.MM.dd");
    private static final SimpleDateFormat TIME_FMT =
            new SimpleDateFormat("HH:mm:ss.SSS");

    // java.time formatters for c.java types (LocalDate, LocalTime, LocalDateTime, Instant)
    private static final DateTimeFormatter LOCAL_DATE_FMT =
            DateTimeFormatter.ofPattern("yyyy.MM.dd");
    private static final DateTimeFormatter LOCAL_TIME_FMT =
            DateTimeFormatter.ofPattern("HH:mm:ss.SSS");
    private static final DateTimeFormatter LOCAL_DATETIME_FMT =
            DateTimeFormatter.ofPattern("yyyy.MM.dd'T'HH:mm:ss.SSS");

    /**
     * Walk a kdb+ result object and return a typed JSON structure.
     */
    public Map<String, Object> walk(Object obj) {
        if (obj == null) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("type", "atom");
            m.put("v", null);
            m.put("vt", "null");
            return m;
        }

        String className = obj.getClass().getName();

        // --- atoms ---
        Map<String, Object> atom = tryAtom(obj, className);
        if (atom != null) return atom;

        // --- c.Flip (table) ---
        if (className.equals("com.kx.c$Flip")) {
            return walkFlip(obj);
        }

        // --- c.Dict ---
        if (className.equals("com.kx.c$Dict")) {
            return walkDict(obj);
        }

        // --- c.Projection (partially applied function) ---
        if (className.equals("com.kx.c$Projection")) {
            return walkProjection(obj);
        }

        // --- char arrays (kdb char vectors / lambdas) → convert to string ---
        if (obj.getClass().isArray() && obj.getClass().getComponentType() == char.class) {
            return walkCharArray((char[]) obj);
        }

        // --- arrays (kdb lists) ---
        if (obj.getClass().isArray()) {
            return walkArray(obj);
        }

        // --- Java Lists (mixed lists from kdb) ---
        if (obj instanceof List) {
            return walkList((List<?>) obj);
        }

        // --- fallback: string representation ---
        Map<String, Object> fallback = new LinkedHashMap<>();
        fallback.put("type", "atom");
        fallback.put("v", obj.toString());
        fallback.put("vt", "string");
        return fallback;
    }

    // ---- atom detection ----

    private Map<String, Object> tryAtom(Object obj, String className) {
        String type;
        Object value;

        if (obj instanceof Boolean) {
            type = "boolean";
            value = obj;
        } else if (obj instanceof Byte) {
            type = "byte";
            value = String.format("0x%02x", (Byte) obj & 0xff);
        } else if (obj instanceof Short) {
            type = "short";
            value = kdbNum(obj);
        } else if (obj instanceof Integer) {
            type = "int";
            value = kdbNum(obj);
        } else if (obj instanceof Long) {
            type = "long";
            value = kdbNum(obj);
        } else if (obj instanceof Float) {
            type = "real";
            value = kdbNum(obj);
        } else if (obj instanceof Double) {
            type = "float";
            value = kdbNum(obj);
        } else if (obj instanceof Character) {
            type = "char";
            value = obj.toString();
        } else if (obj instanceof LocalDate) {
            // kdb date — from c.java (java.time)
            type = "date";
            value = ((LocalDate) obj).format(LOCAL_DATE_FMT);
        } else if (obj instanceof LocalTime) {
            // kdb time — from c.java (java.time)
            type = "time";
            value = formatKdbLocalTime((LocalTime) obj);
        } else if (obj instanceof LocalDateTime) {
            // kdb datetime (-15h) — from c.java (java.time)
            type = "datetime";
            value = ((LocalDateTime) obj).format(LOCAL_DATETIME_FMT);
        } else if (obj instanceof Instant) {
            // kdb timestamp (-12h) — from c.java (java.time)
            type = "timestamp";
            value = formatKdbInstant((Instant) obj);
        } else if (obj instanceof String) {
            // c.java returns "func" as a placeholder for non-serializable functions
            if ("func".equals(obj)) {
                type = "function";
                value = obj;
            } else {
                // Could be a symbol or a char vector
                type = "symbol";
                value = obj;
            }
        } else if (obj instanceof Date) {
            // kdb date (no time component)
            type = "date";
            value = DATE_FMT.format((Date) obj);
        } else if (obj instanceof Time) {
            type = "time";
            value = TIME_FMT.format((Time) obj);
        } else if (obj instanceof Timestamp) {
            type = "timestamp";
            value = formatKdbTimestamp((Timestamp) obj);
        } else if (obj instanceof java.util.Date) {
            // kdb datetime
            type = "timestamp";
            value = TIMESTAMP_FMT.format((java.util.Date) obj);
        } else if (obj instanceof UUID) {
            type = "guid";
            value = obj.toString();
        } else if (className.equals("com.kx.c$Month")) {
            type = "month";
            value = obj.toString();
        } else if (className.equals("com.kx.c$Minute")) {
            type = "minute";
            value = obj.toString();
        } else if (className.equals("com.kx.c$Second")) {
            type = "second";
            value = obj.toString();
        } else if (className.equals("com.kx.c$Timespan")) {
            type = "timespan";
            value = obj.toString();
        } else if (className.equals("com.kx.c$Function") ||
                   className.equals("com.kx.c$Fun")) {
            type = "function";
            value = obj.toString();
        } else {
            // Not an atom we know about
            return null;
        }

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "atom");
        m.put("v", value);
        m.put("vt", type);
        return m;
    }

    // ---- table (c.Flip) ----

    private Map<String, Object> walkFlip(Object flip) {
        try {
            Field xField = flip.getClass().getField("x"); // column names
            Field yField = flip.getClass().getField("y"); // column data arrays

            String[] colNames = (String[]) xField.get(flip);
            Object[] colData = (Object[]) yField.get(flip);

            int rowCount = 0;
            if (colData.length > 0) {
                rowCount = Array.getLength(colData[0]);
            }

            // Columns metadata
            List<Map<String, Object>> columns = new ArrayList<>();
            for (int i = 0; i < colNames.length; i++) {
                Map<String, Object> colMeta = new LinkedHashMap<>();
                colMeta.put("name", colNames[i]);
                // Infer column type from first element
                if (colData[i] != null &&
                        colData[i].getClass().isArray() &&
                        Array.getLength(colData[i]) > 0) {
                    Object first = Array.get(colData[i], 0);
                    Map<String, Object> typed = walk(first);
                    String t = (String) typed.get("vt");
                    if (t == null) t = (String) typed.get("type");
                    colMeta.put("type", t != null ? t : "unknown");
                } else {
                    colMeta.put("type", "unknown");
                }
                columns.add(colMeta);
            }

            // Rows — convert each row to an array of values
            List<List<Object>> rows = new ArrayList<>();
            for (int r = 0; r < rowCount; r++) {
                List<Object> row = new ArrayList<>();
                for (int c = 0; c < colNames.length; c++) {
                    try {
                        Object val = null;
                        if (colData[c] != null &&
                                colData[c].getClass().isArray() &&
                                r < Array.getLength(colData[c])) {
                            val = Array.get(colData[c], r);
                        }
                        if (val == null || isScalar(val)) {
                            row.add(walkScalar(val));
                        } else {
                            row.add(walk(val));
                        }
                    } catch (Exception e) {
                        // Error recovery per cell
                        Map<String, Object> err = new LinkedHashMap<>();
                        err.put("type", "atom");
                        err.put("v", "? cell error");
                        err.put("vt", "error");
                        row.add(err);
                    }
                }
                rows.add(row);
            }

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("type", "table");
            m.put("columns", columns);
            m.put("rows", rows);
            m.put("rowCount", rowCount);
            return m;

        } catch (Exception e) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("type", "error");
            m.put("message", "Failed to convert table: " + e.getMessage());
            return m;
        }
    }

    // ---- dict (c.Dict) ----

    private Map<String, Object> walkDict(Object dict) {
        try {
            Field xField = dict.getClass().getField("x"); // keys
            Field yField = dict.getClass().getField("y"); // values

            Object keys = xField.get(dict);
            Object values = yField.get(dict);

            Map<String, Object> walkedKeys = walk(keys);
            Map<String, Object> walkedValues = walk(values);

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("type", "dict");
            m.put("keys", walkedKeys);
            m.put("values", walkedValues);
            return m;

        } catch (Exception e) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("type", "error");
            m.put("message", "Failed to convert dict: " + e.getMessage());
            return m;
        }
    }

    // ---- projection (c.Projection) ----

    private Map<String, Object> walkProjection(Object proj) {
        try {
            Field itemsField = proj.getClass().getField("items");
            Object[] items = (Object[]) itemsField.get(proj);

            // Walk each item
            List<Object> walkedItems = new ArrayList<>(items.length);
            for (Object item : items) {
                if (item == null) {
                    walkedItems.add(null);
                } else if (item.getClass().isArray() && item.getClass().getComponentType() == char.class) {
                    // char array → string (lambda function representation)
                    walkedItems.add(new String((char[]) item));
                } else if (isScalar(item)) {
                    walkedItems.add(walkScalar(item));
                } else {
                    walkedItems.add(walk(item));
                }
            }

            // Build a REPL-style representation: func[arg1;arg2;...]
            // In kdb IPC, items[0] is the function, items[1..n-1] are the bound args.
            StringBuilder sb = new StringBuilder();
            if (items.length > 0) {
                // Function is the first item
                Object funcRaw = walkedItems.get(0);
                String funcStr;
                if (funcRaw instanceof Map) {
                    Map<String, Object> fm = (Map<String, Object>) funcRaw;
                    funcStr = fm.get("v") != null ? fm.get("v").toString() : "λ";
                } else if (funcRaw instanceof String) {
                    funcStr = (String) funcRaw;
                } else {
                    funcStr = String.valueOf(funcRaw);
                }
                if ("func".equals(funcStr)) funcStr = "λ";
                sb.append(funcStr).append('[');
                // Args are items[1] through items[n-1]
                for (int i = 1; i < walkedItems.size(); i++) {
                    if (i > 1) sb.append(';');
                    Object arg = walkedItems.get(i);
                    if (arg == null) continue;
                    if (arg instanceof String) {
                        sb.append((String) arg);
                    } else if (arg instanceof Number) {
                        sb.append(arg);
                    } else if (arg instanceof Map) {
                        sb.append(toJson(arg));
                    } else {
                        sb.append(arg);
                    }
                }
                sb.append(']');
            } else {
                sb.append("λ[]");
            }

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("type", "atom");
            m.put("v", sb.toString());
            m.put("vt", "function");
            return m;

        } catch (Exception e) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("type", "atom");
            m.put("v", "λ");
            m.put("vt", "function");
            return m;
        }
    }

    // ---- char arrays (kdb char vectors / lambdas) ----

    /**
     * Convert a char array to a string representation.
     * kdb+ char vectors and lambdas arrive as char[] from c.java.
     * We display them as strings for readability.
     */
    private Map<String, Object> walkCharArray(char[] chars) {
        String s = new String(chars);
        Map<String, Object> m = new LinkedHashMap<>();
        // If it looks like a lambda/function, mark it accordingly
        if (s.startsWith("{") || s.equals("func")) {
            m.put("type", "atom");
            m.put("v", s);
            m.put("vt", "function");
        } else {
            m.put("type", "atom");
            m.put("v", s);
            m.put("vt", "string");
        }
        return m;
    }

    // ---- arrays (kdb homogeneous lists) ----

    private Map<String, Object> walkArray(Object arr) {
        int len = Array.getLength(arr);
        // A String[] from c.java is a symbol vector (char vectors arrive as char[]),
        // so tag each element as a symbol atom — otherwise the list would render
        // without backticks (`a`b`c shown as "a b c").
        boolean isSymbolVector = arr instanceof String[];
        List<Object> items = new ArrayList<>(len);
        for (int i = 0; i < len; i++) {
            try {
                Object elem = Array.get(arr, i);
                if (elem == null) {
                    items.add(null);
                } else if (isSymbolVector) {
                    items.add(symbolAtom((String) elem));
                } else if (isScalar(elem)) {
                    items.add(walkScalar(elem));
                } else {
                    items.add(walk(elem));
                }
            } catch (Exception e) {
                // Error recovery: insert placeholder instead of failing entire query
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("type", "atom");
                err.put("v", "? type error: " + e.getMessage());
                err.put("vt", "error");
                items.add(err);
            }
        }

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "list");
        m.put("items", items);
        m.put("length", len);
        return m;
    }

    // ---- Java List (kdb mixed lists) ----

    private Map<String, Object> walkList(List<?> list) {
        List<Object> items = new ArrayList<>(list.size());
        for (Object elem : list) {
            try {
                if (elem == null) {
                    items.add(null);
                } else if (isScalar(elem)) {
                    items.add(walkScalar(elem));
                } else {
                    items.add(walk(elem));
                }
            } catch (Exception e) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("type", "atom");
                err.put("v", "? type error: " + e.getMessage());
                err.put("vt", "error");
                items.add(err);
            }
        }

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "list");
        m.put("items", items);
        m.put("length", list.size());
        return m;
    }

    /**
     * Format a java.sql.Timestamp in kdb+ REPL style with nanosecond precision:
     *   2026.07.09D18:19:50.144271000
     */
    private static String formatKdbTimestamp(Timestamp ts) {
        String base = TIMESTAMP_FMT.format(ts);
        // Always show full 9-digit precision (SSS + 6 more digits)
        String frac = String.format("%09d", ts.getNanos());
        return base + frac.substring(3); // skip the milliseconds (already in base via SSS)
    }

    /**
     * Format a java.time.Instant in kdb+ REPL style with nanosecond precision:
     *   2026.07.09D18:19:50.144271000
     */
    private static String formatKdbInstant(Instant p) {
        // Build the date+time part using LocalDateTime
        LocalDateTime ldt = LocalDateTime.ofInstant(p, java.time.ZoneOffset.UTC);
        String base = ldt.format(java.time.format.DateTimeFormatter.ofPattern("yyyy.MM.dd'D'HH:mm:ss"));
        // Always show full 9-digit nanosecond precision — never trim
        String frac = String.format("%09d", p.getNano());
        return base + "." + frac;
    }

    /**
     * Format a java.time.LocalTime in kdb+ REPL style:
     *   18:19:50.144
     */
    private static String formatKdbLocalTime(LocalTime t) {
        // Always show full nanosecond precision
        String frac = String.format("%09d", t.getNano());
        return t.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss")) + "." + frac;
    }

    // ---- scalar helpers ----

    /**
     * Check if a value is a leaf-level scalar (not a dict, table, or list).
     */
    private boolean isScalar(Object obj) {
        return obj instanceof Boolean ||
               obj instanceof Number ||
               obj instanceof String ||
               obj instanceof Character ||
               obj instanceof Date ||
               obj instanceof UUID ||
               obj == null;
    }

    /**
     * Map kdb+ null/infinity sentinel numbers to their q notation (0Wi/0Ni/0w/0n
     * …); pass any other number through unchanged. Also converts non-finite
     * doubles/floats to strings so the result stays valid JSON (JSON has no
     * Infinity/NaN — emitting them would break the whole response).
     */
    private static Object kdbNum(Object obj) {
        if (obj instanceof Short) {
            short v = (Short) obj;
            if (v == Short.MAX_VALUE) return "0Wh";
            if (v == Short.MIN_VALUE) return "0Nh";
            if (v == -Short.MAX_VALUE) return "-0Wh";
            return (int) v;
        }
        if (obj instanceof Integer) {
            int v = (Integer) obj;
            if (v == Integer.MAX_VALUE) return "0Wi";
            if (v == Integer.MIN_VALUE) return "0Ni";
            if (v == -Integer.MAX_VALUE) return "-0Wi";
            return v;
        }
        if (obj instanceof Long) {
            long v = (Long) obj;
            if (v == Long.MAX_VALUE) return "0Wj";
            if (v == Long.MIN_VALUE) return "0Nj";
            if (v == -Long.MAX_VALUE) return "-0Wj";
            return v;
        }
        if (obj instanceof Float) {
            float v = (Float) obj;
            if (Float.isNaN(v)) return "0Ne";
            if (v == Float.POSITIVE_INFINITY) return "0We";
            if (v == Float.NEGATIVE_INFINITY) return "-0We";
            return (double) v;
        }
        if (obj instanceof Double) {
            double v = (Double) obj;
            if (Double.isNaN(v)) return "0n";
            if (v == Double.POSITIVE_INFINITY) return "0w";
            if (v == Double.NEGATIVE_INFINITY) return "-0w";
            return v;
        }
        return obj;
    }

    /** A symbol atom node: {type:'atom', v:'a', vt:'symbol'} — renders as `a. */
    private static Map<String, Object> symbolAtom(String s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "atom");
        m.put("v", s);
        m.put("vt", "symbol");
        return m;
    }

    /**
     * Convert a scalar kdb value to a plain Java value suitable for JSON.
     * Returns null for null.
     */
    private Object walkScalar(Object obj) {
        if (obj == null) return null;
        if (obj instanceof Boolean) return obj;
        if (obj instanceof Byte) return String.format("0x%02x", (Byte) obj & 0xff);
        if (obj instanceof Short || obj instanceof Integer || obj instanceof Long
                || obj instanceof Float || obj instanceof Double) return kdbNum(obj);
        if (obj instanceof String) return obj;
        if (obj instanceof Character) return obj.toString();
        if (obj instanceof LocalDate) return ((LocalDate) obj).format(LOCAL_DATE_FMT);
        if (obj instanceof LocalTime) return formatKdbLocalTime((LocalTime) obj);
        if (obj instanceof LocalDateTime) return ((LocalDateTime) obj).format(LOCAL_DATETIME_FMT);
        if (obj instanceof Instant) return formatKdbInstant((Instant) obj);
        if (obj instanceof Date) return DATE_FMT.format((Date) obj);
        if (obj instanceof Timestamp) return formatKdbTimestamp((Timestamp) obj);
        if (obj instanceof java.util.Date) return TIMESTAMP_FMT.format((java.util.Date) obj);
        if (obj instanceof UUID) return obj.toString();
        return obj.toString();
    }

    // ---- JSON serialization ----

    /**
     * Convert a Map/List/number/string structure to a JSON string.
     * Simple implementation — no external dependency required.
     */
    public String toJson(Object obj) {
        StringBuilder sb = new StringBuilder();
        writeJson(sb, obj);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private void writeJson(StringBuilder sb, Object obj) {
        if (obj == null) {
            sb.append("null");
        } else if (obj instanceof String) {
            sb.append('"');
            sb.append(escapeJson((String) obj));
            sb.append('"');
        } else if (obj instanceof Boolean) {
            sb.append(obj);
        } else if (obj instanceof Number) {
            Number n = (Number) obj;
            if (n.doubleValue() == n.longValue() &&
                    !Double.isInfinite(n.doubleValue())) {
                sb.append(n.longValue());
            } else {
                sb.append(n.doubleValue());
            }
        } else if (obj instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<String, Object> e :
                    ((Map<String, Object>) obj).entrySet()) {
                if (!first) sb.append(',');
                sb.append('"');
                sb.append(escapeJson(e.getKey()));
                sb.append('"');
                sb.append(':');
                writeJson(sb, e.getValue());
                first = false;
            }
            sb.append('}');
        } else if (obj instanceof List) {
            sb.append('[');
            boolean first = true;
            for (Object item : (List<?>) obj) {
                if (!first) sb.append(',');
                writeJson(sb, item);
                first = false;
            }
            sb.append(']');
        } else {
            sb.append('"');
            sb.append(escapeJson(obj.toString()));
            sb.append('"');
        }
    }

    private String escapeJson(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.toString();
    }
}
