package com.mercury;

import com.mercury.kdb.ConnectionManager;
import com.mercury.kdb.QueryExecutor;
import com.mercury.kdb.TypeMapper;
import com.mercury.config.ConfigManager;
import com.mercury.files.FileBrowser;

import org.cef.callback.CefV8Handler;
import org.cef.V8Value;
import org.cef.V8ValueList;

import java.util.List;
import java.util.Map;

/**
 * V8 handler that exposes Java backend methods to the JavaScript frontend.
 *
 * Each method maps to a callable function on the `window.mercury` object:
 *
 *   window.mercury.query(connId, queryText)  → JSON string result
 *   window.mercury.getConnections()          → JSON array of connections
 *   window.mercury.addConnection(name, host, port)
 *   window.mercury.removeConnection(connId)
 *   window.mercury.testConnection(host, port) → JSON { success, error }
 *   window.mercury.listFiles(path)           → JSON array of file entries
 *   window.mercury.readFile(path)            → file contents as string
 *   window.mercury.saveFile(path, content)
 *   window.mercury.getQueryHistory()         → JSON array of history entries
 */
public class MercuryBridge implements CefV8Handler {

    private final ConnectionManager connectionManager;
    private final QueryExecutor queryExecutor;
    private final TypeMapper typeMapper;
    private final ConfigManager configManager;
    private final FileBrowser fileBrowser;

    public MercuryBridge(ConnectionManager connectionManager,
                          QueryExecutor queryExecutor,
                          TypeMapper typeMapper,
                          ConfigManager configManager,
                          FileBrowser fileBrowser) {
        this.connectionManager = connectionManager;
        this.queryExecutor = queryExecutor;
        this.typeMapper = typeMapper;
        this.configManager = configManager;
        this.fileBrowser = fileBrowser;
    }

    @Override
    public boolean execute(String name, CefV8Value object,
                            CefV8ValueList arguments, CefV8ValueList retval,
                            String exception) {
        try {
            switch (name) {
                case "query":
                    return handleQuery(arguments, retval);
                case "getConnections":
                    return handleGetConnections(retval);
                case "addConnection":
                    return handleAddConnection(arguments, retval);
                case "removeConnection":
                    return handleRemoveConnection(arguments, retval);
                case "testConnection":
                    return handleTestConnection(arguments, retval);
                case "listFiles":
                    return handleListFiles(arguments, retval);
                case "readFile":
                    return handleReadFile(arguments, retval);
                case "saveFile":
                    return handleSaveFile(arguments, retval);
                case "getQueryHistory":
                    return handleGetQueryHistory(retval);
                default:
                    return false;
            }
        } catch (Exception e) {
            retval.setValue(0,
                    CefV8Value.createString("{\"error\": \"" + escapeJson(e.getMessage()) + "\"}"));
            return true;
        }
    }

    private boolean handleQuery(CefV8ValueList args, CefV8ValueList retval) {
        String connId = args.getValue(0).getStringValue();
        String queryText = args.getValue(1).getStringValue();
        String resultJson = queryExecutor.executeQuery(connId, queryText);
        retval.setValue(0, CefV8Value.createString(resultJson));
        return true;
    }

    private boolean handleGetConnections(CefV8ValueList retval) {
        List<Map<String, Object>> conns = connectionManager.getAllConnectionInfo();
        String json = typeMapper.toJson(conns);
        retval.setValue(0, CefV8Value.createString(json));
        return true;
    }

    private boolean handleAddConnection(CefV8ValueList args, CefV8ValueList retval) {
        String name = args.getValue(0).getStringValue();
        String host = args.getValue(1).getStringValue();
        int port = args.getValue(2).getIntValue();
        String id = connectionManager.addConnection(name, host, port);
        configManager.saveConnections(connectionManager.getAllConnectionInfo());
        retval.setValue(0, CefV8Value.createString(
                "{\"id\": \"" + escapeJson(id) + "\"}"));
        return true;
    }

    private boolean handleRemoveConnection(CefV8ValueList args, CefV8ValueList retval) {
        String connId = args.getValue(0).getStringValue();
        connectionManager.removeConnection(connId);
        configManager.saveConnections(connectionManager.getAllConnectionInfo());
        retval.setValue(0, CefV8Value.createString("{\"ok\": true}"));
        return true;
    }

    private boolean handleTestConnection(CefV8ValueList args, CefV8ValueList retval) {
        String host = args.getValue(0).getStringValue();
        int port = args.getValue(1).getIntValue();
        String result = connectionManager.testConnection(host, port);
        retval.setValue(0, CefV8Value.createString(result));
        return true;
    }

    private boolean handleListFiles(CefV8ValueList args, CefV8ValueList retval) {
        String path = args.getValue(0).getStringValue();
        String json = fileBrowser.listDirectory(path);
        retval.setValue(0, CefV8Value.createString(json));
        return true;
    }

    private boolean handleReadFile(CefV8ValueList args, CefV8ValueList retval) {
        String path = args.getValue(0).getStringValue();
        String content = fileBrowser.readFile(path);
        retval.setValue(0, CefV8Value.createString(content));
        return true;
    }

    private boolean handleSaveFile(CefV8ValueList args, CefV8ValueList retval) {
        String path = args.getValue(0).getStringValue();
        String content = args.getValue(1).getStringValue();
        fileBrowser.saveFile(path, content);
        retval.setValue(0, CefV8Value.createString("{\"ok\": true}"));
        return true;
    }

    private boolean handleGetQueryHistory(CefV8ValueList retval) {
        String json = typeMapper.toJson(configManager.loadQueryHistory());
        retval.setValue(0, CefV8Value.createString(json));
        return true;
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
