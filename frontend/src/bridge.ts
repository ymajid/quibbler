/**
 * Typed wrapper around the Java backend.
 *
 * JCEF mode: calls window.mercury.* (V8 bridge).
 * HTTP mode:  calls DevServer REST API.
 *
 * Queries are sent as raw text in the HTTP body to avoid JSON escaping issues
 * with special characters like quotes in q expressions.
 */

export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  group: string;
  useTls?: boolean;
  status: 'connected' | 'disconnected';
}

export interface QueryResult {
  type: 'table' | 'dict' | 'keyedTable' | 'list' | 'atom' | 'error';
  [key: string]: unknown;
}

export interface TableResult {
  type: 'table';
  columns: Array<{ name: string; type: string }>;
  rows: unknown[][];
  rowCount: number;
}

export interface DictResult {
  type: 'dict';
  keys: QueryResult;
  values: QueryResult;
}

export interface ListResult {
  type: 'list';
  items: unknown[];
  length: number;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
  size?: number;
}

export interface HistoryEntry {
  id: string;
  query: string;
  timestamp: string;
  connectionId: string;
  status: string;
  rowCount: number;
  durationMs: number;
  errorMessage?: string;
}

declare global {
  interface Window {
    mercury?: {
      query(connId: string, queryText: string): string;
      getConnections(): string;
      addConnection(name: string, host: string, port: number, username: string, password: string, group?: string, useTls?: boolean): string;
      removeConnection(connId: string): string;
      testConnection(host: string, port: number, username: string, password: string): string;
      listFiles(path: string): string;
      readFile(path: string): string;
      saveFile(path: string, content: string): string;
      getQueryHistory(): string;
      getWorkspace(connId: string): string;
    };
  }
}

const useHttp = !window.mercury;
const BASE = 'http://127.0.0.1:8090';

function syncPost(path: string, body?: string, contentType?: string): string {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', BASE + path, false);
  if (contentType) xhr.setRequestHeader('Content-Type', contentType);
  xhr.send(body ?? null);
  return xhr.responseText;
}

function syncGet(path: string): string {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', BASE + path, false);
  xhr.send();
  return xhr.responseText;
}

// ---- Public API ----

let _activeXhr: XMLHttpRequest | null = null;

/** Async query — returns a Promise so the UI stays responsive during execution. */
export function queryAsync(connId: string, queryText: string): Promise<QueryResult> {
  return new Promise((resolve, reject) => {
    if (!useHttp) {
      try {
        resolve(JSON.parse(window.mercury!.query(connId, queryText)));
      } catch (e: any) { reject(e); }
      return;
    }
    const xhr = new XMLHttpRequest();
    _activeXhr = xhr;
    xhr.open('POST', BASE + '/api/query?connId=' + encodeURIComponent(connId), true); // async
    xhr.setRequestHeader('Content-Type', 'text/plain');
    xhr.onload = () => {
      _activeXhr = null;
      try { resolve(JSON.parse(xhr.responseText)); }
      catch (e: any) { reject(new Error('Failed to parse result')); }
    };
    xhr.onerror = () => { _activeXhr = null; reject(new Error('Network error')); };
    xhr.onabort = () => { _activeXhr = null; reject(new Error('Cancelled')); };
    xhr.send(queryText ?? null);
  });
}

/** Synchronous query — blocks UI but simpler for quick calls. */
export function query(connId: string, queryText: string): QueryResult {
  if (!useHttp) {
    return JSON.parse(window.mercury!.query(connId, queryText));
  }
  const raw = syncPost('/api/query?connId=' + encodeURIComponent(connId), queryText, 'text/plain');
  return JSON.parse(raw);
}

export function cancelQuery(): void {
  if (_activeXhr) {
    _activeXhr.abort();
    _activeXhr = null;
  }
  // Also tell the server to cancel any in-flight query
  try { syncPost('/api/cancel', '{}', 'application/json'); } catch {}
}

export function getConnections(): Connection[] {
  if (!useHttp) return JSON.parse(window.mercury!.getConnections());
  return JSON.parse(syncGet('/api/connections'));
}

export function addConnection(name: string, host: string, port: number,
                               username: string, password: string, group?: string, useTls?: boolean): { id: string } {
  if (!useHttp) return JSON.parse(window.mercury!.addConnection(name, host, port, username, password, group, useTls));
  const body = JSON.stringify({ name, host, port, username, password, group: group || '', useTls: !!useTls });
  return JSON.parse(syncPost('/api/connections', body, 'application/json'));
}

export function removeConnection(connId: string): void {
  if (!useHttp) { window.mercury!.removeConnection(connId); return; }
  syncPost('/api/connections/delete', JSON.stringify({ id: connId }), 'application/json');
}

/** Move a connection to a different folder/group ('' = ungrouped). */
export function moveConnection(connId: string, group: string): void {
  syncPost('/api/connections/move', JSON.stringify({ id: connId, group }), 'application/json');
}

export function testConnection(host: string, port: number,
                                username?: string, password?: string): { success: boolean; error?: string } {
  if (!useHttp) return JSON.parse(window.mercury!.testConnection(host, port, username || '', password || ''));
  const body = JSON.stringify({ host, port, username: username || '', password: password || '' });
  return JSON.parse(syncPost('/api/testConnection', body, 'application/json'));
}

/**
 * Async connection test — never blocks the UI thread. Use when probing many
 * connections at once (startup, command palette) so dead hosts (2s timeout each)
 * don't freeze the app.
 */
export function testConnectionAsync(host: string, port: number,
                                     username?: string, password?: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (!useHttp) {
      try { resolve(JSON.parse(window.mercury!.testConnection(host, port, username || '', password || ''))); }
      catch (e: any) { resolve({ success: false, error: e?.message || String(e) }); }
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE + '/api/testConnection', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({ success: false, error: 'parse error' }); } };
    xhr.onerror = () => resolve({ success: false, error: 'network error' });
    xhr.send(JSON.stringify({ host, port, username: username || '', password: password || '' }));
  });
}

export function listFiles(dirPath: string): FileEntry[] | { error: string } {
  if (!useHttp) return JSON.parse(window.mercury!.listFiles(dirPath));
  return JSON.parse(syncPost('/api/files', JSON.stringify({ path: dirPath }), 'application/json'));
}

export function readFile(filePath: string): string {
  if (!useHttp) return window.mercury!.readFile(filePath);
  const raw = syncPost('/api/readFile', JSON.stringify({ path: filePath }), 'application/json');
  const data = JSON.parse(raw);
  return data.content ?? raw;
}

export function saveFile(filePath: string, content: string): void {
  if (!useHttp) { window.mercury!.saveFile(filePath, content); return; }
  syncPost('/api/saveFile', JSON.stringify({ path: filePath, content }), 'application/json');
}

export function getQueryHistory(): HistoryEntry[] {
  if (!useHttp) return JSON.parse(window.mercury!.getQueryHistory());
  return JSON.parse(syncGet('/api/history'));
}

export function getWorkspace(connId: string): WorkspaceContext {
  if (!useHttp) return JSON.parse(window.mercury!.getWorkspace(connId));
  return JSON.parse(syncGet('/api/workspace?connId=' + encodeURIComponent(connId)));
}

/** Async workspace fetch — used for schema/autocomplete refresh so it never
 *  blocks the UI thread (the sync version is kept for the JCEF bridge path). */
export function getWorkspaceAsync(connId: string): Promise<WorkspaceContext> {
  return new Promise((resolve, reject) => {
    if (!useHttp) {
      try { resolve(JSON.parse(window.mercury!.getWorkspace(connId))); }
      catch (e: any) { reject(e); }
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('GET', BASE + '/api/workspace?connId=' + encodeURIComponent(connId), true);
    xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('parse error')); } };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.send();
  });
}

export interface WorkspaceContext {
  tables: Record<string, Array<{ name: string; type: string }>>;
  functions: string[];
  variables: string[];
}

export function isBridgeAvailable(): boolean {
  return true;
}
