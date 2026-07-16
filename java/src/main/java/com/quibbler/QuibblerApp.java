package com.quibbler;

import com.quibbler.kdb.ConnectionManager;
import com.quibbler.kdb.QueryExecutor;
import com.quibbler.kdb.TypeMapper;
import com.quibbler.config.ConfigManager;
import com.quibbler.files.FileBrowser;

import org.cef.CefApp;
import org.cef.CefClient;
import org.cef.CefSettings;
import org.cef.CefApp.CefAppState;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.callback.CefV8Callback;
import org.cef.handler.CefV8Handler;
import org.cef.handler.CefRenderProcessHandlerAdapter;
import org.cef.V8Context;
import org.cef.V8Value;

import javax.swing.*;
import java.awt.*;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Main entry point for quibbler — a lightweight kdb+/q IDE.
 *
 * Uses JCEF (Java Chromium Embedded Framework) to embed a Chromium browser
 * hosting the Monaco Editor frontend. Communication between JS and Java
 * happens via JCEF's V8 bridge — no HTTP server or WebSockets.
 */
public class QuibblerApp {

    private static final String APP_NAME = "quibbler";
    private static final int WINDOW_WIDTH = 1400;
    private static final int WINDOW_HEIGHT = 900;

    // Default to Vite dev server in development; loads from classpath in production
    private static final boolean DEV_MODE = Boolean.parseBoolean(
            System.getProperty("quibbler.dev", "true"));

    private static final String DEV_URL = "http://localhost:5173";
    private static final String PROD_URL = "http://quibbler/frontend/index.html";

    private final ConnectionManager connectionManager;
    private final QueryExecutor queryExecutor;
    private final TypeMapper typeMapper;
    private final ConfigManager configManager;
    private final FileBrowser fileBrowser;

    private CefApp cefApp;
    private CefClient cefClient;
    private CefBrowser cefBrowser;

    public QuibblerApp() {
        this.connectionManager = new ConnectionManager();
        this.typeMapper = new TypeMapper();
        this.queryExecutor = new QueryExecutor(connectionManager, typeMapper);
        this.configManager = new ConfigManager();
        this.fileBrowser = new FileBrowser();
    }

    public void start() {
        // Load persisted connections
        configManager.loadConnections().forEach(c ->
            connectionManager.addConnection(c.id, c.name, c.host, c.port));

        // Initialize CEF
        initializeCef();

        // Create the application window
        JFrame frame = createWindow();

        // Create the browser
        createBrowser(frame);

        // Show the window
        frame.setVisible(true);
    }

    private void initializeCef() {
        // Get path to CEF native libraries
        String jcefLibPath = System.getProperty("java.library.path", "");
        String osName = System.getProperty("os.name", "").toLowerCase();

        CefSettings settings = new CefSettings();
        settings.windowless_rendering_enabled = false;
        settings.log_severity = CefSettings.LogSeverity.LOGSEVERITY_WARNING;

        // Optional: configure cache path
        String userHome = System.getProperty("user.home");
        settings.cache_path = Paths.get(userHome, ".quibbler", "cache").toString();

        // Initialize CEF
        cefApp = CefApp.getInstance(settings);
    }

    private JFrame createWindow() {
        JFrame frame = new JFrame(APP_NAME);
        frame.setDefaultCloseOperation(JFrame.DO_NOTHING_ON_CLOSE);
        frame.setSize(WINDOW_WIDTH, WINDOW_HEIGHT);
        frame.setLocationRelativeTo(null);

        // Handle close — dispose CEF cleanly
        frame.addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                shutdown();
                frame.dispose();
            }
        });

        return frame;
    }

    private void createBrowser(JFrame frame) {
        cefClient = cefApp.createClient();

        // Register the V8 bridge: this injects window.quibbler into the JS context
        cefClient.addRenderProcessHandler(new CefRenderProcessHandlerAdapter() {
            @Override
            public void onContextCreated(CefBrowser browser, CefFrame frame,
                                          CefV8Context context) {
                QuibblerBridge bridge = new QuibblerBridge(
                        connectionManager, queryExecutor, typeMapper,
                        configManager, fileBrowser);
                int mask = CefV8Value.V8_PROPERTY_ATTRIBUTE_NONE;
                context.getGlobal().setValue("quibbler",
                        CefV8Value.createObject(bridge), mask);
            }
        });

        String url = DEV_MODE ? DEV_URL : PROD_URL;
        cefBrowser = cefClient.createBrowser(url, false, false);
        Component browserUI = cefBrowser.getUIComponent();

        frame.add(browserUI, BorderLayout.CENTER);
    }

    private void shutdown() {
        // Save connection state before exit
        if (connectionManager != null) {
            configManager.saveConnections(connectionManager.getAllConnectionInfo());
        }

        // Dispose CEF resources
        if (cefBrowser != null) {
            cefBrowser.close(true);
        }
        if (cefClient != null) {
            cefClient.dispose();
        }
        if (cefApp != null) {
            cefApp.dispose();
        }
    }

    public static void main(String[] args) {
        // Ensure config directory exists
        try {
            Files.createDirectories(Paths.get(
                System.getProperty("user.home"), ".quibbler"));
            Files.createDirectories(Paths.get(
                System.getProperty("user.home"), ".quibbler", "cache"));
        } catch (IOException e) {
            System.err.println("Warning: could not create ~/.quibbler directory: "
                    + e.getMessage());
        }

        // Start on the AWT event thread
        SwingUtilities.invokeLater(() -> {
            QuibblerApp app = new QuibblerApp();
            app.start();
        });
    }
}
