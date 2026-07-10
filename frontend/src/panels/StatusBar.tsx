import { activeConnection, lastTiming, connections, activeConnectionId, connectionStatuses } from '../store';

export function StatusBar() {
  const conn = activeConnection.value;
  const timing = lastTiming.value;
  const liveStatus = activeConnectionId.value ? connectionStatuses.value[activeConnectionId.value] : null;
  const dot = liveStatus === 'connected' ? '🟢' : '🔴';

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

      {/* Shortcuts hint */}
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>
        Ctrl+Enter run · Ctrl+P switch · Ctrl+N new tab
      </span>
    </div>
  );
}
