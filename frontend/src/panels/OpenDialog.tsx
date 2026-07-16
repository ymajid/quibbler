import { useState, useEffect } from 'preact/hooks';
import { openDialogVisible } from '../store';
import * as bridge from '../bridge';

/**
 * Open-file dialog (Ctrl+O). Browse directories, filter, and click a file to
 * open it in an editor tab. Opening is delegated to EditorPanel via the
 * window.__quibblerOpenFile hook it installs.
 */
export function OpenDialog() {
  const [dir, setDir] = useState('');
  const [entries, setEntries] = useState<bridge.FileEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = (path: string) => {
    try {
      const result = bridge.listFiles(path);
      if (Array.isArray(result)) {
        setEntries(result as bridge.FileEntry[]);
        setDir(path); setPathInput(path); setFilter(''); setError(null);
      } else {
        setError((result as any).error || 'Cannot list directory');
      }
    } catch (e: any) { setError(e.message); }
  };

  useEffect(() => { if (openDialogVisible.value) load(''); }, [openDialogVisible.value]);

  // Global Ctrl+O — the editor has its own action when focused; this catches the
  // case where it isn't, and stops the browser's native open dialog.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        if (document.activeElement?.closest('.monaco-editor')) return;
        e.preventDefault();
        openDialogVisible.value = true;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!openDialogVisible.value) return null;

  const open = (entry: bridge.FileEntry) => {
    const path = dir ? dir + '/' + entry.name : entry.name;
    (window as any).__quibblerOpenFile?.(path, entry.name);
    openDialogVisible.value = false;
  };
  const goUp = () => { if (!dir) return; const p = dir.split('/'); p.pop(); load(p.join('/')); };

  const q = filter.trim().toLowerCase();
  const match = (e: bridge.FileEntry) => !q || e.name.toLowerCase().includes(q);
  const dirs = entries.filter(e => e.type === 'directory' && match(e));
  const files = entries.filter(e => e.type !== 'directory' && match(e));
  const isQ = (n: string) => n.endsWith('.q') || n.endsWith('.k');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh' }}
      onClick={e => { if ((e.target as HTMLElement).dataset.overlay === 'true') openDialogVisible.value = false; }}
      data-overlay="true">
      <div style={{ background: 'var(--bg-toolbar)', borderRadius: '6px', width: '560px', maxHeight: '600px', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-bright)' }}>Open File</div>

        <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border)' }}>
          <button onClick={goUp} disabled={!dir} title="Parent directory" style={smallBtn}>↑</button>
          <span style={{ color: 'var(--text-dim)', fontFamily: 'monospace', fontSize: '12px' }}>/</span>
          <input value={pathInput}
            onInput={e => setPathInput((e.target as HTMLInputElement).value)}
            onKeyDown={e => { if (e.key === 'Enter') load(pathInput.replace(/^\/+/, '')); if (e.key === 'Escape') openDialogVisible.value = false; }}
            placeholder="type a path, Enter to go"
            style={{ flex: 1, background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid var(--border-strong)', padding: '3px 8px', borderRadius: '3px', fontSize: '12px', outline: 'none', fontFamily: 'monospace' }} />
        </div>

        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
          <input value={filter} autoFocus
            onInput={e => setFilter((e.target as HTMLInputElement).value)}
            onKeyDown={e => { if (e.key === 'Escape') openDialogVisible.value = false; }}
            placeholder={`Search (${dirs.length} folders, ${files.length} files)…`}
            style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid var(--border-strong)', padding: '4px 8px', borderRadius: '3px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ flex: 1, overflow: 'auto', minHeight: '200px', maxHeight: '340px', fontFamily: 'monospace', fontSize: '12px' }}>
          {error && <div style={{ padding: '8px 12px', color: 'var(--status-error)' }}>{error}</div>}
          {dirs.map(e => (
            <div key={'d/' + e.name} onClick={() => load(dir ? dir + '/' + e.name : e.name)} title="Open folder"
              style={row('var(--syntax-yellow)')}
              onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
              onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = 'transparent'}>📁 {e.name}</div>
          ))}
          {files.map(e => (
            <div key={'f/' + e.name} onClick={() => open(e)} title="Open file"
              style={row(isQ(e.name) ? 'var(--syntax-teal)' : 'var(--text-secondary)')}
              onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
              onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = 'transparent'}>📄 {e.name}</div>
          ))}
          {dirs.length === 0 && files.length === 0 && !error && (
            <div style={{ padding: '10px 12px', color: 'var(--text-dim)' }}>{q ? 'No matches.' : 'Empty folder.'}</div>
          )}
        </div>

        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => openDialogVisible.value = false}
            style={{ padding: '5px 16px', border: '1px solid var(--border-strong)', borderRadius: '3px', cursor: 'pointer', fontSize: '12px', background: 'var(--bg-input)', color: 'var(--text-bright)' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const row = (color: string) => ({ padding: '4px 12px', cursor: 'pointer', color, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' });
const smallBtn = { background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid var(--border-strong)', borderRadius: '3px', cursor: 'pointer', fontSize: '14px', padding: '2px 8px' };
