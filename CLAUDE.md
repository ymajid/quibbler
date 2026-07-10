# mercury — kdb+/q IDE

A lightweight desktop IDE for kdb+/q. **Frontend** = Preact + signals + Monaco +
ECharts (Vite). **Backend** = Java `com.sun.net.httpserver` DevServer talking to
kdb+ via `c.java` IPC. Chrome runs in `--app` mode against the DevServer.

See `README.md` for full first-time setup (Java compile, `c.java`, kdb+ on 5001).
Most day-to-day work is in `frontend/` — see `frontend/CLAUDE.md`.

## Layout

```
frontend/            Preact UI (all the interactive surface) — see its CLAUDE.md
java/src/main/java/
  com/mercury/       DevServer + kdb/config/files backends
  com/kx/c.java      KX IPC driver (copied in, not committed)
pom.xml              Java build
```

## Build & run

One command builds the whole thing into a self-contained `dist/mercury.jar`
(frontend embedded, zero Java deps). Needs JDK 17+ and Node 18+:

```bash
scripts/build.sh          # or scripts\build.ps1 / scripts\build.bat on Windows
scripts/run.sh            # build if needed, then launch
java -jar dist/mercury.jar

# Frontend-only iteration:
cd frontend && npm run build          # vite build → frontend/dist
./node_modules/.bin/tsc --noEmit      # typecheck (see gotcha below)
```

`mvn -q package` (after `npm run build`) is an equivalent Maven path →
`target/mercury.jar`. Packaging (jar zip + no-Java Windows app image) is in
`scripts/` and `.github/workflows/release.yml`; end-user launchers live in
`packaging/`.

`DevServer` serves the built UI — from `frontend/dist` on disk in a dev checkout,
or from the classpath (`/frontend`) inside the packaged jar — plus a REST API
(`/api/query`, `/api/connections`, `/api/testConnection`, `/api/workspace`,
`/api/files`, …). The frontend calls it through `frontend/src/bridge.ts` (or
`window.mercury.*` when embedded in JCEF). Only the DevServer path is compiled by
the build; the JCEF `MercuryApp`/`MercuryBridge` sources are excluded.

## Conventions

- **Confirm before committing/pushing** — this working copy is not a git repo;
  don't assume version control.
- **Styling** goes through CSS custom properties (`var(--bg)`, `var(--accent)`,
  `var(--status-ok)`, …) defined for light+dark in `frontend/index.html`. Never
  hard-code theme colors in components; charts are the one exception (ECharts
  can't read CSS vars — see `frontend/CLAUDE.md`).
- **All UI state lives in signals** in `frontend/src/store.ts`. Components read
  `signal.value`; there's no other store.

## Gotcha: `tsc --noEmit` has ~13 pre-existing errors

`EditorPanel.tsx` uses a `useRef` as an ad-hoc container via `.value` (instead of
`.current`), which TypeScript flags as `Property 'value' does not exist on
MutableRef`. These are harmless (the app runs; esbuild ignores types) and predate
current work. When typechecking, filter them out:

```bash
./node_modules/.bin/tsc --noEmit 2>&1 | grep -vE "currentTabPath|MutableRef<string"
```
