import { useEffect } from 'preact/hooks';
import { currentDir, fileEntries, openFileTab, addConsoleMessage } from '../store';
import * as bridge from '../bridge';
import type { FileEntry } from '../bridge';

export function FileBrowserPanel() {
  useEffect(() => {
    refreshDir(currentDir.value || '.');
  }, []);

  const refreshDir = (path: string) => {
    try {
      const result = bridge.listFiles(path);
      if ('error' in result) {
        addConsoleMessage('File error: ' + result.error, 'error');
        return;
      }
      currentDir.value = path;
      fileEntries.value = result;
    } catch (e: any) {
      addConsoleMessage('File error: ' + e.message, 'error');
    }
  };

  const handleClick = (entry: FileEntry) => {
    if (entry.type === 'directory') {
      refreshDir(entry.path);
    } else {
      // Open file in editor tab
      try {
        const content = bridge.readFile(entry.path);
        openFileTab(entry.path, entry.name, content);
        addConsoleMessage('Opened: ' + entry.name);
      } catch (e: any) {
        addConsoleMessage('Failed to open file: ' + e.message, 'error');
      }
    }
  };

  const icon = (entry: FileEntry) => {
    if (entry.type === 'directory') return '📁';
    const ext = entry.extension || '';
    if (['q', 'k'].includes(ext)) return '📄';
    if (['txt', 'csv', 'json'].includes(ext)) return '📝';
    return '📎';
  };

  return (
    <div style={{ fontSize: '12px', padding: '4px 0' }}>
      {/* Current path */}
      <div style={{
        padding: '4px 8px',
        color: 'var(--text-secondary)',
        fontSize: '10px',
        wordBreak: 'break-all',
        borderBottom: '1px solid var(--border)',
        marginBottom: '4px',
      }}>
        {currentDir.value || '~'}
      </div>

      {/* File list */}
      {fileEntries.value.map((entry, i) => (
        <div
          key={i}
          onClick={() => handleClick(entry)}
          style={{
            padding: '4px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-bright)',
          }}
          onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--bg-hover)'}
          onMouseLeave={e => (e.target as HTMLElement).style.background = 'transparent'}
        >
          <span>{icon(entry)}</span>
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {entry.name}
          </span>
          {entry.size !== undefined && (
            <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '10px' }}>
              {formatSize(entry.size)}
            </span>
          )}
        </div>
      ))}

      {fileEntries.value.length === 0 && (
        <div style={{ padding: '12px', color: 'var(--text-dim)', textAlign: 'center' }}>
          Empty directory
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
