import { useState, useEffect, useRef } from 'preact/hooks';
import { paletteVisible, connections, activeConnectionId, connectionStatuses, editorTabs, activeEditorTabPath, addConsoleMessage, refreshConnectionStatuses } from '../store';

export function ConnectionPalette() {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = () => {
    paletteVisible.value = true;
    setQuery('');
    setSelectedIdx(0);
    // Re-probe connections in the background so the green/red dots are live.
    refreshConnectionStatuses();
  };

  // Listen for editor action and global shortcut
  useEffect(() => {
    const paletteHandler = () => open();
    window.addEventListener('quibbler:palette', paletteHandler);
    return () => window.removeEventListener('quibbler:palette', paletteHandler);
  }, []);

  // Also catch Ctrl+P at document level (when editor doesn't have focus)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        // Let Monaco handle it if the editor is focused (its action will dispatch quibbler:palette)
        if (document.activeElement?.closest('.monaco-editor')) return;
        e.preventDefault();
        open();
      }
      if (e.key === 'Escape' && paletteVisible.value) {
        paletteVisible.value = false;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (paletteVisible.value) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [paletteVisible.value]);

  if (!paletteVisible.value) return null;

  const conns = connections.value;
  const tabs = editorTabs.value;
  const statuses = connectionStatuses.value;

  // Merge tabs + connections into a single searchable list
  interface PaletteItem { type: 'tab' | 'conn'; label: string; sub: string; tabPath?: string; conn?: typeof conns[0]; status?: 'connected' | 'disconnected' | 'error'; }
  const allItems: PaletteItem[] = [
    ...tabs.map(t => ({ type: 'tab' as const, label: t.name, sub: t.dirty ? 'unsaved' : 'open', tabPath: t.path })),
    ...conns.map(c => ({ type: 'conn' as const, label: (c.group ? c.group + '/' : '') + c.name, sub: `${c.host}:${c.port}`, conn: c, status: statuses[c.id] })),
  ];

  const q = query.trim().toLowerCase();
  const filtered: PaletteItem[] = q
    ? allItems.filter(item => item.label.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q))
    : allItems;

  const safeIdx = Math.min(selectedIdx, Math.max(0, filtered.length - 1));

  const handleSelect = (item: PaletteItem) => {
    if (item.type === 'tab' && item.tabPath) {
      activeEditorTabPath.value = item.tabPath;
    } else if (item.type === 'conn' && item.conn) {
      activeConnectionId.value = item.conn.id;
      addConsoleMessage(`Switched to ${item.conn.name}`);
    }
    paletteVisible.value = false;
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[safeIdx]) handleSelect(filtered[safeIdx]);
    if (e.key === 'Escape') paletteVisible.value = false;
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'var(--bg-overlay)', zIndex: 1000,
      display: 'flex', justifyContent: 'center', paddingTop: '15vh',
    }}
      onClick={(e) => { if ((e.target as HTMLElement).dataset.overlay === 'true') paletteVisible.value = false; }}
      data-overlay="true">
      <div style={{
        background: 'var(--bg-toolbar)', borderRadius: '6px', width: '420px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        <input
          ref={inputRef}
          value={query}
          onInput={e => { setQuery((e.target as HTMLInputElement).value); setSelectedIdx(0); }}
          onKeyDown={handleKey}
          placeholder="Search tabs & connections..."
          style={{
            width: '100%', background: 'var(--bg-input)', color: 'var(--text-bright)', border: 'none',
            padding: '10px 14px', fontSize: '13px', outline: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <div style={{ maxHeight: '300px', overflow: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: '12px', textAlign: 'center' }}>
              No matches for "{query}"
            </div>
          )}
          {filtered.map((item, i) => {
            // Connection rows carry a live status dot: green = connected,
            // red = error/unreachable, muted = not yet probed.
            const dotColor = item.type !== 'conn' ? null
              : item.status === 'connected' ? 'var(--status-ok)'
              : item.status === 'error' || item.status === 'disconnected' ? 'var(--status-error)'
              : 'var(--text-dim)';
            const dotTitle = item.status === 'connected' ? 'Connected'
              : item.status === 'error' || item.status === 'disconnected' ? 'Unreachable'
              : 'Checking…';
            return (
              <div key={item.type + (item.tabPath || item.conn?.id || i)}
                onClick={() => handleSelect(item)}
                style={{
                  padding: '8px 14px', cursor: 'pointer', fontSize: '12px',
                  background: i === safeIdx ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: i === safeIdx ? '3px solid var(--accent)' : '3px solid transparent',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                }}>
                <span style={{ color: 'var(--text-bright)', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  {item.type === 'conn'
                    ? <span title={dotTitle} style={{ color: dotColor!, marginRight: '7px', fontSize: '10px', flexShrink: 0, lineHeight: 1 }}>●</span>
                    : <span style={{ marginRight: '6px', flexShrink: 0 }}>📄</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                </span>
                <span style={{ color: 'var(--text-dim)', fontSize: '11px', flexShrink: 0 }}>{item.sub}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
