import { activeConnection, lastTiming, connections, activeConnectionId, connectionStatuses, cursorInfo, editorLanguage } from '../store';

const LANGUAGES = ['q', 'shell', 'python', 'sql', 'yaml'];

export function StatusBar() {
  const conn = activeConnection.value;
  const timing = lastTiming.value;
  const cursor = cursorInfo.value;
  const lang = editorLanguage.value;
  const liveStatus = activeConnectionId.value ? connectionStatuses.value[activeConnectionId.value] : null;
  const dot = liveStatus === 'connected' ? '🟢'
    : (liveStatus === 'error' || liveStatus === 'disconnected') ? '🔴'
    : '⚪';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: '22px', padding: '0 10px',
      background: 'var(--accent)', color: 'var(--text-white)', fontSize: '11px',
      fontFamily: 'system-ui, sans-serif', gap: '12px', flexShrink: 0,
      userSelect: 'none',
    }}>
      {/* Server */}
      <span>
        {dot} {conn ? `${conn.name} (${conn.host}:${conn.port})` : 'No connection'}
      </span>

      <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>

      {/* Row count */}
      {timing && (
        <span>{timing.rowCount.toLocaleString()} rows</span>
      )}

      {/* Timing */}
      {timing && (
        <>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
          <span title="Total elapsed time (button press → render complete)">
            {timing.totalMs}ms
          </span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px' }} title="kdb+ IPC + query processing">
            server {timing.serverMs}ms
          </span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px' }} title="HTTP + outbound JSON serialization + frontend deserialization">
            network {timing.networkMs}ms
          </span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px' }} title="DOM rendering">
            render {timing.renderMs}ms
          </span>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Editor language (highlighting only) — switch a scratch tab to shell/python/… */}
      <span title="Editor language — highlighting only, never executed" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <select value={lang}
          onChange={e => window.dispatchEvent(new CustomEvent('quibbler:setLanguage', { detail: { lang: (e.target as HTMLSelectElement).value } }))}
          style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '11px', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '1px 2px' }}>
          {LANGUAGES.map(l => <option key={l} value={l} style={{ color: '#000' }}>{l}</option>)}
        </select>
      </span>
      <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>

      {/* Cursor position + characters on the current line */}
      {cursor && (
        <>
          <span title="Line, column · characters on this line" style={{ color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>
            Ln {cursor.line}, Col {cursor.col} · {cursor.lineChars} chars
          </span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
        </>
      )}

      {/* Shortcuts hint */}
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>
        Ctrl+Enter run · Ctrl+P switch · Ctrl+N new tab
      </span>
    </div>
  );
}
