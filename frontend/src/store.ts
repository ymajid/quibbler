import { signal, computed } from '@preact/signals';
import type { Connection, QueryResult, HistoryEntry, FileEntry } from './bridge';
import * as bridge from './bridge';

// ---- Connections ----
export const connections = signal<Connection[]>([]);
export const activeConnectionId = signal<string | null>(null);

// Track live connection status per connection id (updated on select/test)
export const connectionStatuses = signal<Record<string, 'connected' | 'disconnected' | 'error'>>({});

/**
 * Probe the given connections (or all of them) in the background and update
 * `connectionStatuses` as each result lands. Non-blocking — safe to call on
 * startup and whenever the connection palette opens.
 *
 * Each probe opens a short-lived connection to the kdb+ process, so results are
 * cached for STATUS_TTL_MS: opening the palette repeatedly won't re-probe a
 * connection that was just checked (avoids hammering prod with open/close churn).
 * Pass `force` to bypass the cache (e.g. an explicit refresh).
 */
const _lastProbedAt: Record<string, number> = {};
const STATUS_TTL_MS = 30_000;
export function refreshConnectionStatuses(list: Connection[] = connections.value, force = false) {
  const now = Date.now();
  for (const c of list) {
    if (!force && (now - (_lastProbedAt[c.id] || 0)) < STATUS_TTL_MS) continue;
    _lastProbedAt[c.id] = now;
    bridge.testConnectionAsync(c.host, c.port, c.username || undefined, c.password || undefined)
      .then(r => {
        connectionStatuses.value = { ...connectionStatuses.value, [c.id]: r.success ? 'connected' : 'error' };
      })
      .catch(() => {
        connectionStatuses.value = { ...connectionStatuses.value, [c.id]: 'error' };
      });
  }
}

export const activeConnection = computed(() => {
  const id = activeConnectionId.value;
  if (!id) return null;
  return connections.value.find(c => c.id === id) ?? null;
});

export interface EditorTab { path: string; name: string; content: string; dirty: boolean }

// ---- Editor ----
export const editorTabs = signal<EditorTab[]>([]);
export const activeEditorTabPath = signal<string | null>(null);

export const activeEditorTab = computed(() => {
  const p = activeEditorTabPath.value;
  if (!p) return null;
  return editorTabs.value.find(t => t.path === p) ?? null;
});

// ---- Chart Config ----
export const chartNeedsRender = signal(true);
export const chartConfigs = signal<Record<number, ChartConfig>>({});  // keyed by queryId
export const chartConfig = signal<ChartConfig>({ type: 'line', xColumn: '', yColumns: [], groupBy: [], title: '' });
export interface ChartConfig {
  type: 'line' | 'bar' | 'scatter' | 'area' | 'candlestick' | 'heatmap' | 'pie';
  xColumn: string;
  yColumns: string[];
  groupBy?: string[];
  title?: string;
  stack?: boolean;  // true = stack bars/areas; false/absent = overlay (side-by-side bars, transparent fills)
  yAuto?: boolean;  // true while yColumns is still the auto-detected default (untouched by the user)
}

// ---- Popped-out (detached) charts ----
// Each opens a real OS window (draggable out of the app, even to another
// monitor) holding a frozen snapshot of the result + config, so later queries
// can't change it. Query results are replaced (never mutated) on a new run, so
// keeping the reference is enough to freeze it. `win` is the live browser window.
export interface PoppedChart { id: number; data: any; config: ChartConfig; win: Window }
export const poppedCharts = signal<PoppedChart[]>([]);
let _poppedSeq = 1;
export function popOutChart(data: any, config: ChartConfig) {
  const id = _poppedSeq++;
  // Open synchronously, inside the originating click, so the popup blocker
  // treats it as user-initiated and allows it.
  const win = window.open('', 'quibbler-chart-' + id, 'width=920,height=640,menubar=no,toolbar=no,location=no,status=no');
  if (!win) {
    addConsoleMessage('Pop-out blocked by the browser — allow pop-ups for quibbler to detach a chart into its own window.', 'error');
    return;
  }
  poppedCharts.value = [...poppedCharts.value, { id, data, config: { ...config }, win }];
}
export function closePoppedChart(id: number) {
  poppedCharts.value = poppedCharts.value.filter(p => p.id !== id);
}

// ---- Open-file Dialog (Ctrl+O) ----
export const openDialogVisible = signal(false);

// ---- Save-As Dialog ----
export const saveDialogVisible = signal(false);
export const saveDialogDefaultName = signal('untitled.q');
export const saveDialogContent = signal('');

export function newTab(name?: string, content?: string) {
  // Find the lowest unused untitled number — don't just blindly increment
  let n = 1;
  const used = new Set(
    editorTabs.value
      .filter(t => t.path.startsWith('untitled:'))
      .map(t => parseInt(t.path.split(':')[1]) || 0)
  );
  while (used.has(n)) n++;

  const tabName = name || 'untitled-' + n + '.q';
  const tab: EditorTab = {
    path: 'untitled:' + n,
    name: tabName,
    content: content || '',
    dirty: false,
  };
  editorTabs.value = [...editorTabs.value, tab];
  activeEditorTabPath.value = tab.path;
  return tab;
}

export function openFileTab(filePath: string, fileName: string, content: string) {
  // Check if already open
  const existing = editorTabs.value.find(t => t.path === filePath);
  if (existing) {
    activeEditorTabPath.value = filePath;
    return existing;
  }
  const tab: EditorTab = {
    path: filePath,
    name: fileName,
    content,
    dirty: false,
  };
  editorTabs.value = [...editorTabs.value, tab];
  activeEditorTabPath.value = filePath;
  return tab;
}

export function closeTab(filePath: string) {
  const idx = editorTabs.value.findIndex(t => t.path === filePath);
  if (idx < 0) return;
  const tabs = [...editorTabs.value];
  tabs.splice(idx, 1);
  editorTabs.value = tabs;
  if (activeEditorTabPath.value === filePath) {
    activeEditorTabPath.value = tabs.length > 0 ? tabs[Math.min(idx, tabs.length - 1)].path : null;
  }
}

export function updateTabContent(filePath: string, content: string) {
  editorTabs.value = editorTabs.value.map(t =>
    t.path === filePath ? { ...t, content, dirty: true } : t
  );
}

export function markTabClean(filePath: string) {
  editorTabs.value = editorTabs.value.map(t =>
    t.path === filePath ? { ...t, dirty: false } : t
  );
}

export function saveTabContent(filePath: string, content: string) {
  editorTabs.value = editorTabs.value.map(t =>
    t.path === filePath ? { ...t, content, dirty: false } : t
  );
}

export function renameTab(filePath: string, newPath: string, newName: string) {
  editorTabs.value = editorTabs.value.map(t =>
    t.path === filePath ? { ...t, path: newPath, name: newName } : t
  );
  if (activeEditorTabPath.value === filePath) {
    activeEditorTabPath.value = newPath;
  }
}

// ---- Session persistence ----
// The whole workspace is restored on next launch: open tabs (with their
// unsaved content + dirty markers), the active tab and connection, sidebar +
// result-panel selection, and the pane split sizes. Restore runs synchronously
// at module load (see bottom of file) so state is in place before any component
// mounts — persisting from an effect first would clobber the saved session.
const SESSION_KEY = 'quibbler-session';

// Read a persisted value, falling back to the pre-rename ('mercury-*') key so an
// existing session, theme, and quick-connect history survive the rename to
// Quibbler. Writes always target the new 'quibbler-*' key, so old keys fade out.
function lsGet(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
    return localStorage.getItem(key.replace(/^quibbler-/, 'mercury-'));
  } catch { return null; }
}

export function persistSession() {
  try {
    const data = {
      active: activeEditorTabPath.value,
      tabs: editorTabs.value.map(t => ({ path: t.path, name: t.name, content: t.content, dirty: t.dirty })),
      connectionId: activeConnectionId.value,
      sidebarVisible: sidebarVisible.value,
      sidebarTab: sidebarTab.value,
      resultTab: resultPanelTab.value,
      layout: layoutSizes.value,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
}

export function restoreSession(): boolean {
  try {
    const raw = lsGet(SESSION_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);

    // Layout + panel selections (validate before applying)
    if (data.layout && typeof data.layout.sidebar === 'number' && typeof data.layout.editor === 'number') {
      layoutSizes.value = { sidebar: data.layout.sidebar, editor: data.layout.editor };
    }
    if (typeof data.sidebarVisible === 'boolean') sidebarVisible.value = data.sidebarVisible;
    if (['connections', 'schema', 'files'].includes(data.sidebarTab)) sidebarTab.value = data.sidebarTab;
    if (['result', 'console', 'history', 'chart'].includes(data.resultTab)) resultPanelTab.value = data.resultTab;
    // Restored connection is validated against the loaded list in setConnections().
    if (data.connectionId) activeConnectionId.value = data.connectionId;

    if (!data.tabs?.length) return false;
    // Preserve unsaved content AND the dirty flag so nothing is silently "lost".
    const tabs: EditorTab[] = data.tabs.map((t: any) => ({
      path: t.path,
      name: t.name,
      content: t.content || '',
      dirty: !!t.dirty,
    }));
    editorTabs.value = tabs;

    if (data.active && tabs.find(t => t.path === data.active)) {
      activeEditorTabPath.value = data.active;
    } else {
      activeEditorTabPath.value = tabs[0].path;
    }
    return true;
  } catch { return false; }
}

// ---- Query Results ----
export const queryResult = signal<QueryResult | null>(null);
export const queryError = signal<string | null>(null);
export const queryRunning = signal(false);
export const queryId = signal(0);  // incremented each query — forces renderers to remount

// ---- Query Timing ----
export interface QueryTiming { totalMs: number; serverMs: number; networkMs: number; renderMs: number; rowCount: number }
export const lastTiming = signal<QueryTiming | null>(null);

// ---- Result history (scroll back through the last few unique results) ----
export interface ResultSnapshot { result: QueryResult; error: string | null; timing: QueryTiming | null; text: string; ts: string; sig: string }
export const resultHistory = signal<ResultSnapshot[]>([]);
export const resultHistoryIndex = signal(0);  // 0 = latest; higher = older
// Snapshots hold references to full result objects (a table can be large), so
// keep this modest to bound memory — old results beyond it are dropped/GC'd.
const MAX_RESULT_HISTORY = 15;

function resultSig(result: QueryResult, text: string): string {
  const rc = result?.type === 'table' ? (result as any).rowCount
    : result?.type === 'list' ? (result as any).length : '';
  return (result?.type ?? '') + '|' + rc + '|' + text.trim();
}

/** Record a result for history navigation, collapsing an immediate repeat. */
export function pushResultSnapshot(result: QueryResult, text: string, timing: QueryTiming | null, error: string | null = null) {
  const sig = resultSig(result, text);
  const hist = resultHistory.value;
  if (hist.length > 0 && hist[0].sig === sig) {
    // Same as the most recent — refresh it rather than adding a duplicate.
    resultHistory.value = [{ ...hist[0], timing, ts: new Date().toISOString() }, ...hist.slice(1)];
  } else {
    const snap: ResultSnapshot = { result, error, timing, text: text.trim(), ts: new Date().toISOString(), sig };
    resultHistory.value = [snap, ...hist].slice(0, MAX_RESULT_HISTORY);
  }
  resultHistoryIndex.value = 0;
}

/** Show a past result by index (0 = latest). Reuses the normal result renderers. */
export function showResultAt(idx: number) {
  const h = resultHistory.value;
  if (idx < 0 || idx >= h.length) return;
  resultHistoryIndex.value = idx;
  const snap = h[idx];
  queryResult.value = snap.result;
  queryError.value = snap.error;
  queryId.value++;              // fresh id → clean remount of the renderers
  lastTiming.value = snap.timing;
}

// ---- Workspace refresh debouncing ----
export const workspaceNeedsRefresh = signal(0);
export function triggerWorkspaceRefresh() {
  workspaceNeedsRefresh.value++;
}

// ---- Connection Palette ----
export const paletteVisible = signal(false);

// ---- Align dialog (align selected lines on a delimiter) ----
export const alignDialog = signal<{ startLine: number; endLine: number } | null>(null);

// ---- Confirm Close (unsaved changes) ----
export const confirmClosePath = signal<string | null>(null);

// ---- Console (kdb REPL-style output) ----
export const consoleMessages = signal<Array<{ text: string; type: 'info' | 'error' | 'result'; timestamp: string }>>([]);

// ---- History ----
export const queryHistory = signal<HistoryEntry[]>([]);

// ---- UI State ----
export const theme = signal<'light' | 'dark'>(
  (typeof localStorage !== 'undefined' && lsGet('quibbler-theme') as 'light' | 'dark') || 'light'
);
export const sidebarVisible = signal(true);
export const sidebarTab = signal<'connections' | 'schema' | 'files'>('connections');
export const resultPanelTab = signal<'result' | 'console' | 'history' | 'chart'>('result');

// Pane split sizes (percentages), persisted so the layout reopens as it closed.
// `sidebar` = sidebar pane width; `editor` = editor pane height (of the vertical split).
export const layoutSizes = signal<{ sidebar: number; editor: number }>({ sidebar: 18, editor: 55 });

// Editor cursor position + current-line length, shown in the status bar.
export const cursorInfo = signal<{ line: number; col: number; lineChars: number } | null>(null);

// Language of the active editor tab (shown + switchable in the status bar).
export const editorLanguage = signal<string>('q');

// Recent quick-connect targets (host:port[:user], no password) for the toolbar
// datalist, so you can re-pick a previous custom connection.
function loadQuickConnect(): string[] {
  try { return JSON.parse(lsGet('quibbler-quickconnect') || '[]'); } catch { return []; }
}
export const quickConnectHistory = signal<string[]>(loadQuickConnect());
export function addQuickConnect(entry: string) {
  const e = entry.trim();
  if (!e) return;
  const next = [e, ...quickConnectHistory.value.filter(x => x !== e)].slice(0, 15);
  quickConnectHistory.value = next;
  try { localStorage.setItem('quibbler-quickconnect', JSON.stringify(next)); } catch {}
}


// ---- File Browser ----
export const currentDir = signal<string>('');
export const fileEntries = signal<FileEntry[]>([]);

// ---- Actions ----

export function addConsoleMessage(text: string, type: 'info' | 'error' | 'result' = 'info') {
  consoleMessages.value = [
    ...consoleMessages.value,
    { text, type, timestamp: new Date().toISOString() }
  ];
  if (consoleMessages.value.length > 1000) {
    consoleMessages.value = consoleMessages.value.slice(-1000);
  }
}

export function clearConsole() {
  consoleMessages.value = [];
}

export function setConnections(list: Connection[]) {
  connections.value = list;
  // Keep a restored/selected connection if it still exists; otherwise fall back.
  const cur = activeConnectionId.value;
  const stillExists = !!cur && list.some(c => c.id === cur);
  if (!stillExists) {
    if (list.length > 0) {
      const connected = list.find(c => c.status === 'connected');
      activeConnectionId.value = connected ? connected.id : list[0].id;
    } else {
      activeConnectionId.value = null;
    }
  }
}

// ---- Session bootstrap ----
// Runs after every persisted signal above is declared. Restoring here (rather
// than in a component effect) guarantees the workspace is in place before the
// first render, avoiding the persist-before-restore race that dropped sessions.
if (!restoreSession()) {
  newTab(undefined, '// quibbler — kdb+/q IDE\n\n');
}

