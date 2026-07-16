package com.quibbler.files;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Provides filesystem operations for the frontend file browser panel.
 *
 * Supports: listing directories, reading files, and saving files.
 * All paths are resolved relative to the user's home directory for safety,
 * unless they are absolute paths.
 */
public class FileBrowser {

    private static final Set<String> Q_EXTENSIONS = Set.of("q", "k", "qx", "txt", "csv", "json");
    private final Path homeDir;

    public FileBrowser() {
        this.homeDir = Paths.get(System.getProperty("user.home"));
    }

    /**
     * List the contents of a directory, returning JSON.
     *
     * @param dirPath path to list; empty string or "." means home directory
     * @return JSON array of file/directory entries
     */
    public String listDirectory(String dirPath) {
        Path dir = resolvePath(dirPath);
        if (!Files.exists(dir)) {
            return "{\"error\": \"Path does not exist: " + escapeJson(dir.toString()) + "\"}";
        }
        if (!Files.isDirectory(dir)) {
            return "{\"error\": \"Not a directory: " + escapeJson(dir.toString()) + "\"}";
        }

        List<Map<String, Object>> entries = new ArrayList<>();

        try (Stream<Path> stream = Files.list(dir)) {
            List<Path> paths = stream.sorted((a, b) -> {
                // Directories first, then files; alphabetical within each group
                boolean aDir = Files.isDirectory(a);
                boolean bDir = Files.isDirectory(b);
                if (aDir && !bDir) return -1;
                if (!aDir && bDir) return 1;
                return a.getFileName().toString()
                        .compareToIgnoreCase(b.getFileName().toString());
            }).collect(Collectors.toList());

            // Add parent directory entry if not at root
            if (dir.getParent() != null) {
                Map<String, Object> parent = new LinkedHashMap<>();
                parent.put("name", "..");
                parent.put("path", dir.getParent().toString());
                parent.put("type", "directory");
                entries.add(parent);
            }

            for (Path p : paths) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("name", p.getFileName().toString());
                entry.put("path", p.toString());

                if (Files.isDirectory(p)) {
                    entry.put("type", "directory");
                } else {
                    String ext = getExtension(p.getFileName().toString());
                    entry.put("type", "file");
                    entry.put("extension", ext);
                    try {
                        entry.put("size", Files.size(p));
                    } catch (IOException e) {
                        entry.put("size", 0);
                    }
                }
                entries.add(entry);
            }
        } catch (IOException e) {
            return "{\"error\": \"" + escapeJson(e.getMessage()) + "\"}";
        }

        return toJsonArray(entries);
    }

    /**
     * Read a file and return its contents as a string.
     */
    public String readFile(String filePath) {
        Path path = resolvePath(filePath);
        if (!Files.exists(path)) {
            return "// File not found: " + filePath;
        }
        if (Files.isDirectory(path)) {
            return "// Path is a directory: " + filePath;
        }
        try {
            return Files.readString(path);
        } catch (IOException e) {
            return "// Error reading file: " + e.getMessage();
        }
    }

    /**
     * Save content to a file, creating parent directories if needed.
     */
    public void saveFile(String filePath, String content) throws IOException {
        Path path = resolvePath(filePath);
        Files.createDirectories(path.getParent());
        Files.writeString(path, content);
    }

    // ---- helpers ----

    private Path resolvePath(String input) {
        if (input == null || input.isEmpty() || input.equals(".")) {
            return homeDir;
        }
        Path p = Paths.get(input);
        if (p.isAbsolute()) {
            return p;
        }
        return homeDir.resolve(input);
    }

    private static String getExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        if (dot < 0) return "";
        return filename.substring(dot + 1).toLowerCase();
    }

    private static String toJsonArray(List<Map<String, Object>> entries) {
        StringBuilder sb = new StringBuilder();
        sb.append('[');
        for (int i = 0; i < entries.size(); i++) {
            if (i > 0) sb.append(',');
            Map<String, Object> e = entries.get(i);
            sb.append('{');
            boolean first = true;
            for (Map.Entry<String, Object> kv : e.entrySet()) {
                if (!first) sb.append(',');
                sb.append('"').append(kv.getKey()).append("\":");
                Object v = kv.getValue();
                if (v instanceof String) {
                    sb.append('"').append(escapeJson((String) v)).append('"');
                } else if (v instanceof Number) {
                    sb.append(v);
                } else {
                    sb.append('"').append(escapeJson(String.valueOf(v))).append('"');
                }
                first = false;
            }
            sb.append('}');
        }
        sb.append(']');
        return sb.toString();
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }
}
