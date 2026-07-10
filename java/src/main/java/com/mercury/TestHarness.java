package com.mercury;

import com.mercury.kdb.TypeMapper;
import com.kx.c;

/**
 * Quick end-to-end test harness — connects to a local kdb+ process,
 * exercises all data types, and validates the TypeMapper output.
 *
 * Usage:
 *   javac -d out com/kx/c.java com/mercury/kdb/TypeMapper.java com/mercury/TestHarness.java
 *   java -cp out com.mercury.TestHarness
 */
public class TestHarness {

    private static final TypeMapper mapper = new TypeMapper();
    private static int passed = 0;
    private static int failed = 0;

    public static void main(String[] args) throws Exception {
        System.out.println("=== mercury E2E Test Harness ===\n");

        c conn = null;
        try {
            conn = new c("localhost", 5001);
            System.out.println("✓ Connected to localhost:5001\n");

            // Test each data type
            testTable(conn);
            testDict(conn);
            testNestedDict(conn);
            testKeyedTable(conn);
            testList(conn);
            testAtoms(conn);
            testNull(conn);

        } catch (Exception e) {
            System.err.println("✗ Connection failed: " + e.getMessage());
            System.err.println("Make sure kdb+ is running on port 5001");
            System.exit(1);
        } finally {
            if (conn != null) conn.close();
        }

        System.out.println("\n---");
        System.out.println("Results: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }

    private static void testTable(c conn) throws Exception {
        System.out.println("--- Table ---");
        Object raw = conn.k("t"); // pre-loaded test table
        String json = mapper.toJson(mapper.walk(raw));
        System.out.println(json.substring(0, Math.min(300, json.length())) + "...");

        assertContains(json, "\"type\":\"table\"", "table type marker");
        assertContains(json, "\"sym\"", "column 'sym'");
        assertContains(json, "\"price\"", "column 'price'");
        assertContains(json, "\"size\"", "column 'size'");
        assertContains(json, "\"rowCount\":5", "five rows");
        assertContains(json, "\"AAPL\"", "data row: AAPL");
    }

    private static void testDict(c conn) throws Exception {
        System.out.println("--- Dict ---");
        Object raw = conn.k("d"); // pre-loaded dict `a`b`c!1 2 3
        String json = mapper.toJson(mapper.walk(raw));
        System.out.println(json);

        assertContains(json, "\"type\":\"dict\"", "dict type marker");
    }

    private static void testNestedDict(c conn) throws Exception {
        System.out.println("--- Nested Dict ---");
        Object raw = conn.k("nd"); // pre-loaded nested dict
        String json = mapper.toJson(mapper.walk(raw));
        System.out.println(json.substring(0, Math.min(400, json.length())) + "...");

        assertContains(json, "\"type\":\"dict\"", "outer dict type marker");
        assertContains(json, "\"mercury\"", "string value in nested dict");
        assertContains(json, "\"cpu\"", "cpu key in nested dict");
    }

    private static void testKeyedTable(c conn) throws Exception {
        System.out.println("--- Keyed Table ---");
        Object raw = conn.k("kt"); // pre-loaded keyed table
        String json = mapper.toJson(mapper.walk(raw));
        System.out.println(json);

        assertContains(json, "\"type\":\"dict\"", "keyed table serialized as dict");
    }

    private static void testNull(c conn) throws Exception {
        System.out.println("--- Null ---");
        Object raw = conn.k("0N");
        String json = mapper.toJson(mapper.walk(raw));
        System.out.println("null: " + json);
        assertContains(json, "\"type\":\"atom\"", "null atom type marker");
    }

    private static void testList(c conn) throws Exception {
        System.out.println("--- List ---");
        Object raw = conn.k("nums"); // 1 2 3 4 5
        String json = mapper.toJson(mapper.walk(raw));
        System.out.println(json);

        assertContains(json, "\"type\":\"list\"", "list type marker");
        assertContains(json, "\"items\"", "items array");
    }

    private static void testAtoms(c conn) throws Exception {
        System.out.println("--- Atoms ---");

        // integer
        Object raw = conn.k("42");
        String json = mapper.toJson(mapper.walk(raw));
        System.out.println("int: " + json);
        assertContains(json, "\"type\":\"atom\"", "atom type marker");
        assertContains(json, "\"vt\":\"long\"", "long type tag (kdb ints are 64-bit)");
        assertContains(json, "42", "value 42");

        // float
        raw = conn.k("3.14");
        json = mapper.toJson(mapper.walk(raw));
        System.out.println("float: " + json);
        assertContains(json, "\"vt\":\"float\"", "float type tag");

        // symbol
        raw = conn.k("`test");
        json = mapper.toJson(mapper.walk(raw));
        System.out.println("symbol: " + json);
        assertContains(json, "\"vt\":\"symbol\"", "symbol type tag");

        // boolean
        raw = conn.k("1b");
        json = mapper.toJson(mapper.walk(raw));
        System.out.println("bool: " + json);
        assertContains(json, "\"vt\":\"boolean\"", "boolean type tag");

        // string
        raw = conn.k("\"hello\"");
        json = mapper.toJson(mapper.walk(raw));
        System.out.println("string: " + json);
    }

    private static void assertContains(String haystack, String needle, String desc) {
        if (haystack.contains(needle)) {
            System.out.println("  ✓ " + desc);
            passed++;
        } else {
            System.out.println("  ✗ " + desc + " — missing '" + needle + "'");
            failed++;
        }
    }
}
