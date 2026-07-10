import { useState, useEffect } from 'preact/hooks';
import { queryHistory, resultPanelTab, connections } from '../store';
import * as bridge from '../bridge';

export function HistoryPanel() {
  const [filter, setFilter] = useState('');

  const refresh = () => {
    try {
      const h = bridge.getQueryHistory();
      queryHistory.value = h;
    } catch { /* Bridge not available */ }
  };

  // Refresh on mount and when history tab is selected
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (resultPanelTab.value === 'history') refresh();
  }, [resultPanelTab.value]);

  const all = Array.isArray(queryHistory.value) ? queryHistory.value : [];
  const q = filter.trim().toLowerCase();
  const entries = q ? all.filter(e => e.query?.toLowerCase().includes(q)) : all;

  const handleClick = (query: string) => {
    navigator.clipboard?.writeText(query);
    window.dispatchEvent(new CustomEvent('mercury:setQuery', { detail: { query } }));
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Search */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input
          placeholder={all.length ? `Search ${all.length} queries…` : 'No history'}
          value={filter}
          onInput={e => setFilter((e.target as HTMLInputElement).value)}
          style={{
            width: '100%', background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid #555',
            padding: '3px 8px', borderRadius: '3px', fontSize: '12px', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto', fontSize: '12px' }}>
        {entries.length === 0 && (
          <div style={{ padding: '12px 16px', color: 'var(--text-dim)' }}>
            {q ? 'No matches.' : 'No query history yet — run queries with <b>Ctrl+Enter</b> to build a history.'}
          </div>
        )}
        {entries.map(entry => (
          <div
            key={entry.id}
            onClick={() => handleClick(entry.query)}
            style={{
              padding: '5px 16px', cursor: 'pointer',
              borderBottom: '1px solid #2d2d2d',
            }}
            onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--bg-hover)'}
            onMouseLeave={e => (e.target as HTMLElement).style.background = 'transparent'}
          >
            <div style={{
              color: 'var(--text)', fontFamily: 'monospace',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              fontSize: '12px',
            }}>
              {entry.query.length > 120 ? entry.query.substring(0, 120) + '...' : entry.query}
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: '10px', marginTop: '1px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <span>{formatTimestamp(entry.timestamp)}</span>
              {entry.connectionId && (
                <span style={{ color: 'var(--syntax-blue)' }}>{connections.value.find(c => c.id === entry.connectionId)?.name ?? entry.connectionId}</span>
              )}
              {entry.status && (
                <span style={{ color: entry.status === 'error' ? 'var(--status-error)' : 'var(--text-secondary)' }}>
                  {entry.status === 'error' ? '✗ ' + ((entry as any).errorMessage || 'Error') : '✓'}
                </span>
              )}
              {(entry.rowCount ?? 0) > 0 && (
                <span style={{ color: 'var(--text-secondary)' }}>{(entry.rowCount ?? 0).toLocaleString()} rows</span>
              )}
              {(entry.durationMs ?? 0) > 0 && (
                <span style={{ color: 'var(--text-secondary)' }}>{entry.durationMs}ms</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso; }
}
