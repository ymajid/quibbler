# mercury frontend

Preact + `@preact/signals` + Monaco Editor + ECharts, bundled by Vite. No React
runtime (Vite aliases `react`→`preact/compat`). Split panes via `split.js`.

## Commands

```bash
npm run build                       # vite build → dist/ (what the DevServer serves)
npm run dev                         # vite dev server on :8090-ish (needs backend for data)
./node_modules/.bin/tsc --noEmit    # typecheck — filter pre-existing errors, see root CLAUDE.md
```

## State model

`src/store.ts` is the single source of truth — every piece of UI state is a
`signal`/`computed`. Components read `.value` in render (auto-subscribes) and
write `.value` to update. Key groups: connections + `connectionStatuses`, editor
tabs, chart configs, `poppedCharts`, and UI state (theme, sidebar, result tab,
`layoutSizes`).

### Session persistence (`persistSession`/`restoreSession`)

The whole workspace is saved to `localStorage` (`mercury-session`) and restored
so the app **reopens exactly as it closed** — open tabs *with unsaved content and
dirty flags*, active tab + connection, sidebar/result selection, and split sizes.

- **Restore runs synchronously at module load** (bottom of `store.ts`), before any
  component mounts. Do NOT move it into an effect: child persist-effects fire
  before a parent restore-effect and would clobber the saved session (this was a
  real bug). `App.tsx` holds one `useSignalEffect` that persists on any change.
- Restored `activeConnectionId` is validated in `setConnections()` (dropped if the
  connection no longer exists).

## Charts (`ChartPanel.tsx` + `chartOption.ts`)

The ECharts **option is built by the pure `buildChartOption(config, data, isDark)`
in `src/panels/chartOption.ts`** — no DOM, no signals — so it's headlessly
testable. `ChartPanel.tsx` only owns the ECharts instance, interactions
(drag-zoom, isolate-first legend), and the controls bar. Detached copies live in
`PoppedCharts.tsx` (frozen snapshot of data+config; later queries can't touch it).

Design follows the `dataviz` skill: a **validated categorical palette** (fixed hue
order, stepped per theme), a single-hue sequential ramp for the heatmap, recessive
hairline grid/axes, 2px round-cap lines, capped rounded bars, gradient area
washes, and tabular-number tooltips. Re-run the palette validator if you change
hues.

### ECharts colors don't read CSS vars

`buildChartOption` hard-codes theme-aware `ink`/`palette`/`seqRamp` from
`isDark`, because ECharts can't resolve `var(--…)`. Keep these visually in sync
with `index.html`'s tokens.

### ECharts 6 gotchas (we're on echarts ^6.1) — both caught by the SSR test

- **`grid.containLabel` needs `LegacyGridContainLabel`** registered via
  `echarts.use([...])`, or rotated/long axis labels get clipped.
- **There is no `area` series type** — an area chart is a `line` series with an
  `areaStyle`. `buildChartOption` maps `type:'area'` → `type:'line'`.

### Runtime test for chart options

`src/__tests__/chartOption.render.ts` feeds every chart type + permutation through
the real builder and ECharts SVG/SSR and asserts each renders. Run it:

```bash
./node_modules/.bin/esbuild src/__tests__/chartOption.render.ts \
  --bundle --format=esm --platform=node --outfile=/tmp/t.mjs && node /tmp/t.mjs
```

Same esbuild-bundle-then-node trick verifies `store.ts` (shim `window`/
`localStorage` via `--banner:js`) and the Monaco Monarch grammar
(`monarchCompile`/`MonarchTokenizer` from `node_modules/monaco-editor/esm/...`).

## Editor & q language

`src/editor/qLanguage.ts` is the Monarch grammar. **Monaco tokenizes line-by-line**
— a single regex can't span lines, so multi-line constructs need tokenizer
*states* (e.g. the `blockComment` state: a solitary `/` opens it, a solitary `\`
or EOF closes it, so every line stays `comment`). `defaultToken` is `invalid`, so
anything a rule doesn't claim renders as the error color.

## Bridge (`bridge.ts`)

REST calls use **synchronous** XHR for simplicity, EXCEPT `queryAsync` and
`testConnectionAsync`, which are async so long/dead operations don't freeze the
UI. Probe many connections with `refreshConnectionStatuses()` (non-blocking);
never loop `testConnection` (sync, 2s per dead host) on the UI thread.
