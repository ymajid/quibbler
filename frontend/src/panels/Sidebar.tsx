import { sidebarTab, connections } from '../store';
import { ConnectionsPanel } from './ConnectionsPanel';
import { FileBrowserPanel } from './FileBrowserPanel';
import { SchemaPanel } from './SchemaPanel';

export function Sidebar() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-toolbar)', borderRight: '1px solid var(--border)', minWidth: '180px' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['connections', 'schema', 'files'] as const).map(t => (
          <button key={t} onClick={() => sidebarTab.value = t}
            style={tabStyle(sidebarTab.value === t)}>
            {t === 'connections' ? 'Conns' : t === 'schema' ? 'Schema' : 'Files'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {sidebarTab.value === 'connections' && <ConnectionsPanel />}
        {sidebarTab.value === 'schema' && <SchemaPanel />}
        {sidebarTab.value === 'files' && <FileBrowserPanel />}
      </div>

      <div style={{ padding: '4px 12px', fontSize: '11px', color: 'var(--text-dim)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        {connections.value.length} connection{connections.value.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function tabStyle(active: boolean) {
  return {
    flex: 1,
    padding: '6px 8px',
    background: active ? 'var(--bg)' : 'transparent',
    color: active ? 'var(--text-bright)' : 'var(--text-secondary)',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
  };
}
