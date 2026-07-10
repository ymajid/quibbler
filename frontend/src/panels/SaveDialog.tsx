import { useState, useEffect } from 'preact/hooks';
import * as bridge from '../bridge';

interface Props {
  visible: boolean;
  content: string;
  defaultName: string;
  onSave: (path: string) => void;
  onCancel: () => void;
}

export function SaveDialog({ visible, content, defaultName, onSave, onCancel }: Props) {
  const [dir, setDir] = useState('');
  const [entries, setEntries] = useState<bridge.FileEntry[]>([]);
  const [filename, setFilename] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFilename(defaultName);
    setError(null);
    // Start in home directory
    try {
      const homeEntries = bridge.listFiles('');
      if (!Array.isArray(homeEntries)) {
        setError('Cannot list directory');
        return;
      }
      setEntries(homeEntries as bridge.FileEntry[]);
      setDir('');
    } catch (e: any) {
      setError(e.message);
    }
  }, [visible, defaultName]);

  const navigate = (entry: bridge.FileEntry) => {
    if (entry.type !== 'directory') return;
    const newPath = dir ? dir + '/' + entry.name : entry.name;
    setDir(newPath);
    try {
      const result = bridge.listFiles(newPath);
      if (Array.isArray(result)) {
        setEntries(result as bridge.FileEntry[]);
        setError(null);
      } else {
        setError((result as any).error || 'Cannot list');
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const goUp = () => {
    if (!dir) return;
    const parts = dir.split('/');
    parts.pop();
    const newPath = parts.join('/');
    setDir(newPath);
    try {
      const result = bridge.listFiles(newPath);
      if (Array.isArray(result)) {
        setEntries(result as bridge.FileEntry[]);
        setError(null);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSave = () => {
    if (!filename.trim()) {
      setError('Enter a filename');
      return;
    }
    const filePath = dir ? dir + '/' + filename.trim() : filename.trim();
    onSave(filePath);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={(e) => { if ((e.target as HTMLElement).dataset.overlay === 'true') onCancel(); }}
      data-overlay="true">
      <div style={{
        background: 'var(--bg-toolbar)', borderRadius: '6px', width: '500px', maxHeight: '500px',
        display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          fontSize: '14px', fontWeight: 'bold', color: 'var(--text-bright)',
        }}>
          Save As
        </div>

        {/* Current directory */}
        <div style={{
          padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px',
          borderBottom: '1px solid var(--border)', fontSize: '12px',
        }}>
          <button onClick={goUp} disabled={!dir}
            style={smallBtnStyle}>
            ↑
          </button>
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            /{dir || '(home)'}
          </span>
        </div>

        {/* File listing */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: '150px', maxHeight: '250px' }}>
          {error && <div style={{ padding: '8px 12px', color: 'var(--status-error)', fontSize: '12px' }}>{error}</div>}
          {entries.filter(e => e.type === 'directory').map(e => (
            <div key={e.name} onClick={() => navigate(e)}
              style={{
                padding: '4px 12px', cursor: 'pointer', fontSize: '12px',
                color: 'var(--syntax-yellow)', fontFamily: 'monospace',
              }}
              onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--bg-hover)'}
              onMouseLeave={e => (e.target as HTMLElement).style.background = 'transparent'}>
              📁 {e.name}
            </div>
          ))}
        </div>

        {/* Filename input */}
        <div style={{
          padding: '10px 12px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: '8px', alignItems: 'center',
        }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'nowrap' }}>Save as:</span>
          <input value={filename}
            onInput={e => setFilename((e.target as HTMLInputElement).value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            style={{
              flex: 1, background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid var(--border-strong)',
              padding: '4px 8px', borderRadius: '3px', fontSize: '12px', outline: 'none',
              fontFamily: 'monospace',
            }}
            autoFocus
            onFocus={e => (e.target as HTMLInputElement).select()}
          />
        </div>

        {/* Buttons */}
        <div style={{
          padding: '10px 12px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: '8px', justifyContent: 'flex-end',
        }}>
          <button onClick={onCancel}
            style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-bright)' }}>
            Cancel
          </button>
          <button onClick={handleSave}
            style={{ ...btnStyle, background: 'var(--accent-btn)', color: 'var(--text-white)' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const smallBtnStyle = {
  background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid var(--border-strong)',
  borderRadius: '3px', cursor: 'pointer', fontSize: '14px', padding: '2px 8px',
};

const btnStyle = {
  padding: '5px 16px', border: '1px solid var(--border-strong)', borderRadius: '3px',
  cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
};
