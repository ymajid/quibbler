# quibbler — kdb+/q IDE

A lightweight, fast desktop IDE for kdb+/q. A single self-contained server plus a
Monaco-powered browser UI: multi-tab editing, q autocomplete, rich result tables,
professional charts, a schema explorer, and query history. One ~3 MB jar (or a
no-Java Windows bundle) — no Electron, no install.

```
┌─ Toolbar ───────────────────────────────────────────┐
│ ☰  ● trading/prod › ProdDB     ▶ Run      quibbler   │
├─ Sidebar ───┬─ Editor ──────────────┬─ Results ─────┤
│ [Conns]     │ select price, size    │ price   size   │
│ [Schema]    │ from trades           │ 100.5    500   │
│ [Files]     │ where date=.z.d       │ 101.2    250   │
├─────────────┴───────────────────────┴───────────────┤
│ 🟢 ProdDB | 1,234 rows | 42ms server 38ms net 2ms   │
└─────────────────────────────────────────────────────┘
```

## Download & run

Grab the latest build from **[Releases](https://github.com/ymajid/quibbler/releases/latest)**.
The bundled versions include Java, so there's **nothing to install**:

| Platform | Download | Java? | Run |
|---|---|---|---|
| **Windows** | `quibbler-win-*.zip` (~80 MB) | bundled | unzip → double-click **`quibbler.exe`** |
| **macOS** | `quibbler-mac-*.zip` (~80 MB) | bundled | unzip → open **`quibbler.app`** * |
| **Linux** | `quibbler-linux-*.tar.gz` (~80 MB) | bundled | `tar xzf …` → `./quibbler/bin/quibbler` |
| Any | `quibbler-*.zip` (~3 MB) | needs [17+](https://adoptium.net/temurin/releases/?version=17) | unzip → `start-quibbler.bat` / `./start-quibbler.sh` |

\* macOS build is unsigned, so the first time: **right-click `quibbler.app` → Open**
(or run `xattr -cr quibbler.app`), then it opens normally.

A window opens — click **+ New Connection**, enter your kdb+ `host:port`, then type a
q expression and press **Ctrl+Enter**.

- Google Chrome gives the cleanest window (app mode); any browser works — it falls
  back to your default automatically.
- Different port: pass it as an argument (e.g. `start-quibbler.bat 9000`). Skip
  auto-opening a browser: set `QUIBBLER_NO_BROWSER=1`.

quibbler is a **client** — point it at your own running q process, e.g. `q -p 5000`.
Connections and history are saved under `~/.quibbler` (`%USERPROFILE%\.quibbler` on Windows).

## Features

- **Editor** — Monaco with q syntax highlighting, multi-tab editing, ~200 static
  completions plus live workspace-aware completions (tables, columns, functions)
  and words from the current file. **Align on a delimiter** (Ctrl+Shift+A).
- **Execution** — `Ctrl+Enter` runs the selection or current line; async so the UI
  stays responsive, with Cancel and an optional (off by default) query timeout.
  Timing breaks down server / network / render.
- **Results** — sortable, resizable, filterable tables (virtual-scrolled to 50k
  rows), keyed tables, dicts, lists, and drill-into nested values. Symbols carry
  backticks for copy/paste; CSV / copy-all; **scroll back through recent results**.
- **Charts** — line, bar, scatter, area, candlestick, heatmap, pie on a validated,
  colorblind-safe palette. Hold-drag or pinch to zoom, click a series to isolate,
  crowded axes auto-rotate/downsample, and **pop a chart into its own OS window**
  (frozen to that result, unaffected by later queries).
- **Connections** — organise into folders (**drag a connection between folders**,
  rename or delete folders inline), quick-connect from the toolbar, TLS, fast
  dead-host detection, and a `Ctrl+P` palette with live green/red status dots.
- **Schema explorer** — tables → columns with types; search by table, column, or
  datatype.
- **Session restore** — reopens exactly as you left it: same tabs (including
  unsaved edits), connection, panels, and layout.
- **Themes** — warm light and VS Code-style dark, applied everywhere.

### Keyboard shortcuts

| Shortcut | Action | Shortcut | Action |
|---|---|---|---|
| `Ctrl+Enter` | Run query | `Ctrl+P` | Switch connection / tab |
| `Ctrl+N` | New tab | `Ctrl+W` | Close tab |
| `Ctrl+S` | Save | `Ctrl+Shift+A` | Align selection on delimiter |
| `Ctrl+1..4` | Result / Chart / Console / History | `Ctrl+/` or `?` | Shortcuts help |

## Build from source

You need **JDK 17+** and **Node 18+** on your PATH. The build produces one
self-contained `dist/quibbler.jar` (frontend embedded, zero runtime dependencies).

```bash
# Windows
scripts\build.bat          # or: powershell -ExecutionPolicy Bypass -File scripts\build.ps1
scripts\run.bat            # build if needed, then launch

# macOS / Linux
scripts/build.sh
scripts/run.sh
```

Prefer Maven? `cd frontend && npm run build && cd .. && mvn -q package` produces
`target/quibbler.jar`. Run any of them with `java -jar <path-to>.jar`.

Frontend-only dev with hot reload: `cd frontend && npm run dev`.

### Releases

Pushing a tag builds and publishes both downloads automatically
(`.github/workflows/release.yml`):

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Architecture

```
Browser (Chrome --app or default)
  └─ quibbler.jar  (Java, com.quibbler.DevServer, ~1 file HTTP server)
      ├─ Static UI served from the jar (Vite-built Preact app)
      ├─ REST API (/api/query, /api/connections, /api/workspace, …)
      └─ com.kx.c  IPC → your kdb+ process
```

- **Frontend** — Preact + signals, Monaco Editor, ECharts, split.js (`frontend/`).
- **Backend** — Java 17, `com.sun.net.httpserver`, `c.java` for kdb+ IPC. No
  external Java dependencies; no Electron, no LSP server.
- A legacy JCEF embedded-browser mode (`QuibblerApp`) exists but is not part of the
  packaged build.

## Contributing / notes

- CI builds the frontend, the jar, runs the chart render test, and smoke-tests the
  server on every push (`.github/workflows/ci.yml`).
- Developer docs and gotchas live in `CLAUDE.md` and `frontend/CLAUDE.md`.

## License

MIT — see [`LICENSE`](LICENSE). Bundles `com.kx.c.java` (© Kx Systems, Apache-2.0)
and other third-party components; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
