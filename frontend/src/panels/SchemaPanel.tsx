import { useState, useEffect } from 'preact/hooks';
import { activeConnectionId } from '../store';
import * as bridge from '../bridge';

interface SchemaCol { name: string; type: string }
interface SchemaTree {
  tables: Record<string, SchemaCol[]>;
}

/**
 * Normalize whatever the workspace endpoint returns for a table's columns into
 * a stable {name, type}[] — tolerating plain name strings, {name,type} objects,
 * or objects using alternate keys — so a shape mismatch can never blank the
 * panel or crash the search (`c.name.toLowerCase()` on an undefined name).
 */
function normalizeColumns(raw: unknown): SchemaCol[] {
  if (!Array.isArray(raw)) return [];
  const out: SchemaCol[] = [];
  for (const c of raw) {
    if (typeof c === 'string') {
      if (c) out.push({ name: c, type: '' });
    } else if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      const name = o.name ?? o.column ?? o.col ?? o.c;
      const type = o.type ?? o.t ?? o.datatype ?? '';
      if (name != null && String(name) !== '') out.push({ name: String(name), type: String(type ?? '') });
    }
  }
  return out;
}

export function SchemaPanel() {
  const [schema, setSchema] = useState<SchemaTree | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const refresh = () => {
    const connId = activeConnectionId.value;
    if (!connId) { setSchema(null); return; }
    try {
      const ctx = bridge.getWorkspace(connId);
      const rawTables = (ctx?.tables ?? {}) as Record<string, unknown>;
      const tables: Record<string, SchemaCol[]> = {};
      for (const name of Object.keys(rawTables)) {
        tables[name] = normalizeColumns(rawTables[name]);
      }
      setSchema({ tables });
    } catch { setSchema(null); }
  };

  useEffect(() => { refresh(); }, [activeConnectionId.value]);

  // Also listen for refresh after queries
  useEffect(() => {
    const h = () => refresh();
    window.addEventListener('mercury:execute', h);
    return () => window.removeEventListener('mercury:execute', h);
  }, []);

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpanded(next);
  };

  const insertAtCursor = (text: string) => {
    window.dispatchEvent(new CustomEvent('mercury:insertText', { detail: { text } }));
  };

  if (!schema) {
    return <div style={{ padding: '12px', color: 'var(--text-dim)', fontSize: '12px' }}>No connection selected.</div>;
  }

  const allTables = Object.keys(schema.tables).sort();
  const q = filter.trim().toLowerCase();
  const colMatches = (c: SchemaCol) =>
    c.name.toLowerCase().includes(q) || (!!c.type && c.type.toLowerCase().includes(q));

  // Build the visible rows: a table shows if its name matches or any of its
  // columns match by name/type. When only columns match, show just those
  // (and auto-expand so the match is visible); a table-name match shows all.
  const rows = allTables
    .map(t => {
      const cols = schema.tables[t] ?? [];
      const tableMatches = t.toLowerCase().includes(q);
      const matchedCols = q ? cols.filter(colMatches) : cols;
      const shownCols = (q && !tableMatches) ? matchedCols : cols;
      const autoOpen = q.length > 0 && !tableMatches && matchedCols.length > 0;
      return { t, cols, shownCols, tableMatches, matchedCols, autoOpen };
    })
    .filter(r => !q || r.tableMatches || r.matchedCols.length > 0);

  return (
    <div style={{ fontSize: '12px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filter */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input
          placeholder={`Search ${allTables.length} tables · column · type…`}
          value={filter}
          onInput={e => setFilter((e.target as HTMLInputElement).value)}
          style={{
            width: '100%', background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid #555',
            padding: '3px 8px', borderRadius: '3px', fontSize: '12px', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {rows.map(({ t: tableName, cols, shownCols, autoOpen }) => {
          const isOpen = expanded.has(tableName) || autoOpen;
          return (
            <div key={tableName}>
              <div onClick={() => toggle(tableName)}
                onDblClick={() => insertAtCursor(tableName)}
                title="Click to expand · Double-click to insert"
                style={{
                  padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                  color: 'var(--syntax-yellow)', userSelect: 'none',
                }}>
                <span style={{ fontSize: '10px', color: 'var(--border-strong)' }}>{isOpen ? '▼' : '▶'}</span>
                <span style={{ fontFamily: 'monospace' }}>{tableName}</span>
                <span style={{ color: 'var(--border-strong)', fontSize: '10px' }}>
                  ({q && shownCols.length !== cols.length ? `${shownCols.length}/${cols.length}` : cols.length})
                </span>
              </div>
              {isOpen && shownCols.map(col => (
                <div key={col.name}
                  onClick={() => insertAtCursor(col.name)}
                  title={`${col.name}${col.type ? ': ' + col.type : ''} — click to insert`}
                  style={{
                    padding: '2px 8px 2px 28px', cursor: 'pointer',
                    color: 'var(--syntax-ltblue)', fontFamily: 'monospace',
                    display: 'flex', justifyContent: 'space-between', gap: '8px',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '10px', flexShrink: 0 }}>{col.type || '·'}</span>
                </div>
              ))}
              {isOpen && shownCols.length === 0 && (
                <div style={{ padding: '2px 8px 2px 28px', color: 'var(--text-dim)', fontSize: '11px', fontStyle: 'italic' }}>
                  no columns
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--text-dim)' }}>{q ? 'No matches.' : 'No tables.'}</div>
        )}
      </div>

      {/* Refresh button */}
      <div style={{ padding: '4px 8px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={refresh}
          style={{
            background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid #555',
            borderRadius: '3px', cursor: 'pointer', fontSize: '11px', padding: '2px 8px',
            width: '100%',
          }}>
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}
