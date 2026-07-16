import { useState } from 'preact/hooks';
import { activeConnection, connections, queryRunning, sidebarVisible, activeConnectionId, connectionStatuses, theme, addConsoleMessage, quickConnectHistory, addQuickConnect } from '../store';
import * as bridge from '../bridge';

let _editorRef: any = null;
export function setEditorRef(editor: any) { _editorRef = editor; }

export function Toolbar() {
  const conn = activeConnection.value;
  const [minimapEnabled, setMinimapEnabled] = useState(false);
  const [wordWrapEnabled, setWordWrapEnabled] = useState(false);

  const handleExecute = () => {
    window.dispatchEvent(new CustomEvent('quibbler:execute'));
  };

  // Quick connect: type host:port[:user:pass] and hit Enter — creates the
  // connection and selects it, without opening the full new-connection form.
  const quickConnect = (raw: string) => {
    const s = raw.trim();
    if (!s) return;
    const parts = s.split(':');
    const host = parts[0] || 'localhost';
    const port = parts.length >= 2 ? parseInt(parts[1]) : NaN;
    if (!Number.isFinite(port)) { addConsoleMessage('Quick connect: use host:port', 'error'); return; }
    const user = parts[2] || '';
    const pass = parts[3] || '';
    try {
      // Reuse an existing connection with the same host/port/user rather than
      // piling up duplicates; otherwise create one.
      const existing = connections.value.find(c => c.host === host && c.port === port && (c.username || '') === user);
      const id = existing ? existing.id : bridge.addConnection(s, host, port, user, pass, '', false).id;
      if (!existing) connections.value = bridge.getConnections();
      activeConnectionId.value = id;
      // Remember the target (without the password) for the dropdown.
      addQuickConnect(parts.slice(0, Math.min(parts.length, 3)).join(':'));
      try {
        const r = bridge.testConnection(host, port, user || undefined, pass || undefined);
        connectionStatuses.value = { ...connectionStatuses.value, [id]: r.success ? 'connected' : 'error' };
        addConsoleMessage(r.success ? `Connected: ${host}:${port}` : `${host}:${port} unreachable`, r.success ? 'info' : 'error');
      } catch {
        connectionStatuses.value = { ...connectionStatuses.value, [id]: 'error' };
      }
    } catch (e: any) {
      addConsoleMessage('Quick connect failed: ' + e.message, 'error');
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: '36px', padding: '0 8px',
      background: 'var(--bg-toolbar)', borderBottom: '1px solid var(--border)', gap: '8px',
      userSelect: 'none', flexShrink: 0,
    }}>
      <button onClick={() => { sidebarVisible.value = !sidebarVisible.value; window.dispatchEvent(new CustomEvent('quibbler:layout')); }}
        title="Toggle Sidebar (Ctrl+Shift+F)"
        style={{ background: 'transparent', color: 'var(--text-bright)', border: 'none', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '14px' }}>
        ☰
      </button>

      <select value={conn?.id ?? ''}
        onChange={(e) => {
          const id = (e.target as HTMLSelectElement).value || null;
          activeConnectionId.value = id;
          // Test the newly selected connection
          if (id) {
            const c = connections.value.find(x => x.id === id);
            if (c) {
              try {
                const r = bridge.testConnection(c.host, c.port, c.username || undefined, c.password || undefined);
                connectionStatuses.value = { ...connectionStatuses.value, [id]: r.success ? 'connected' : 'error' };
              } catch {
                connectionStatuses.value = { ...connectionStatuses.value, [id]: 'error' };
              }
            }
          }
        }}
        style={{ background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid #555', padding: '3px 6px', borderRadius: '3px', fontSize: '12px', outline: 'none', width: '200px' }}>
        {connections.value.length === 0 && <option value="">No connections</option>}
        {connections.value.map(c => {
          const isActive = activeConnectionId.value === c.id;
          const liveStatus = connectionStatuses.value[c.id];
          let dot: string;
          if (isActive && liveStatus === 'connected') dot = '●';
          else if (isActive && liveStatus === 'error') dot = '●';
          else if (isActive) dot = '●';
          else dot = '○';
          const label = c.group ? c.group + ' › ' + c.name : c.name;
          return (
            <option key={c.id} value={c.id}>
              {dot} {label} ({c.host}:{c.port})
            </option>
          );
        })}
      </select>

      <input placeholder="host:port ⏎" list="quibbler-quickconnect"
        title="Quick connect — type host:port (optionally :user:pass) and press Enter"
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const el = e.target as HTMLInputElement;
          quickConnect(el.value);
          el.value = '';
        }}
        style={{ background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid #555', padding: '3px 6px', borderRadius: '3px', fontSize: '12px', outline: 'none', width: '128px' }} />
      <datalist id="quibbler-quickconnect">
        {quickConnectHistory.value.map(e => <option key={e} value={e} />)}
      </datalist>

      <button onClick={handleExecute} disabled={queryRunning.value || !conn}
        title="Execute Query (Ctrl+Enter)"
        style={{ background: queryRunning.value ? 'var(--border-strong)' : 'var(--accent-btn)', color: 'var(--text-white)', border: 'none', padding: '4px 10px', borderRadius: '3px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
        {queryRunning.value ? '⏳' : '▶'} Run
      </button>

      {queryRunning.value && (
        <button onClick={() => { bridge.cancelQuery(); }}
          title="Cancel running query"
          style={{ background: 'var(--status-error)', color: 'var(--text-white)', border: 'none', padding: '4px 10px', borderRadius: '3px', cursor: 'pointer', fontSize: '12px' }}>
          ■ Cancel
        </button>
      )}

      <button onClick={() => {
        if (!_editorRef?.monacoEditor) return;
        const newVal = !minimapEnabled;
        _editorRef.monacoEditor.updateOptions({ minimap: { enabled: newVal } });
        setMinimapEnabled(newVal);
      }}
        title={minimapEnabled ? 'Minimap: ON' : 'Minimap: OFF'}
        style={{
          background: 'transparent', color: 'var(--text-secondary)', border: 'none',
          cursor: 'pointer', fontSize: '13px', padding: '2px 6px',
        }}>
        ▦
      </button>

      <button onClick={() => {
        if (!_editorRef?.monacoEditor) return;
        const newVal = !wordWrapEnabled;
        _editorRef.monacoEditor.updateOptions({ wordWrap: newVal ? 'on' : 'off' });
        setWordWrapEnabled(newVal);
      }}
        title={wordWrapEnabled ? 'Word Wrap: ON' : 'Word Wrap: OFF'}
        style={{
          background: 'transparent', color: 'var(--text-secondary)', border: 'none',
          cursor: 'pointer', fontSize: '13px', padding: '2px 6px',
        }}>
        ↩
      </button>

      <div style={{ flex: 1 }} />

      <button onClick={() => { theme.value = theme.value === 'light' ? 'dark' : 'light'; }}
        title={`Switch to ${theme.value === 'light' ? 'dark' : 'light'} mode`}
        style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' }}>
        {theme.value === 'light' ? '🌙' : '☀️'}
      </button>

      <button onClick={() => { window.dispatchEvent(new CustomEvent('quibbler:shortcuts')); }}
        title="Keyboard Shortcuts (?)"
        style={{
          background: 'transparent', color: 'var(--text-secondary)', border: 'none',
          cursor: 'pointer', fontSize: '14px', padding: '2px 6px',
        }}>
        ?
      </button>

      <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>quibbler</span>
    </div>
  );
}
