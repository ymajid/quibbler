import { useState } from 'preact/hooks';
import { connections, activeConnectionId, connectionStatuses, addConsoleMessage } from '../store';
import * as bridge from '../bridge';

interface TreeNode {
  name: string;
  fullPath: string;
  conns: bridge.Connection[];
  children: TreeNode[];
}

function buildTree(list: bridge.Connection[]): TreeNode {
  const root: TreeNode = { name: '', fullPath: '', conns: [], children: [] };

  for (const c of list) {
    const group = c.group || '';
    if (!group) {
      root.conns.push(c);
      continue;
    }
    const parts = group.split('/').filter(p => p);
    let node = root;
    let path = '';
    for (const part of parts) {
      path = path ? path + '/' + part : part;
      let child = node.children.find(ch => ch.name === part);
      if (!child) {
        child = { name: part, fullPath: path, conns: [], children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.conns.push(c);
  }

  // Sort children alphabetically
  const sortNode = (n: TreeNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name));
    n.children.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

function defaultName(hostStr: string, username: string, password: string): string {
  const parts = hostStr.trim().split(':');
  const host = parts[0] || 'localhost';
  const port = parts.length >= 2 ? parts[1] : '5000';
  let n = host + ':' + port;
  const u = username.trim();
  const p = password.trim();
  if (u) n += ':' + u;
  if (p) n += ':' + p;
  return n;
}

export function ConnectionsPanel() {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameManuallySet, setNameManuallySet] = useState(false);
  const [hostStr, setHostStr] = useState('localhost:5000');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [group, setGroup] = useState('');
  const [useTls, setUseTls] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (g: string) => {
    const next = new Set(expandedGroups);
    if (next.has(g)) next.delete(g); else next.add(g);
    setExpandedGroups(next);
  };

  const updateHost = (val: string) => {
    setHostStr(val);
    if (!nameManuallySet) setName(defaultName(val, username, password));
  };
  const updateUser = (val: string) => {
    setUsername(val);
    if (!nameManuallySet) setName(defaultName(hostStr, val, password));
  };
  const updatePass = (val: string) => {
    setPassword(val);
    if (!nameManuallySet) setName(defaultName(hostStr, username, val));
  };

  const startEdit = (conn: bridge.Connection) => {
    setEditingId(conn.id);
    setName(conn.name);
    setNameManuallySet(true);
    setHostStr(conn.host + ':' + conn.port);
    setUsername(conn.username || '');
    setPassword(conn.password || '');
    setGroup(conn.group || '');
    setUseTls(!!conn.useTls);
    setTestResult(null);
    setShowAdd(true);
  };

  const handleSave = () => {
    if (!name.trim() || !hostStr.trim()) return;
    try {
      const parts = hostStr.trim().split(':');
      const host = parts[0] || 'localhost';
      const port = parts.length >= 2 ? parseInt(parts[1]) || 5000 : 5000;
      const u = username.trim() || '';
      const p = password.trim() || '';
      const g = group.trim().replace(/\/+$/, '') || '';

      if (editingId) {
        // Remove old, add updated
        bridge.removeConnection(editingId);
      }
      const result = bridge.addConnection(name.trim(), host, port, u, p, g, useTls);
      const list = bridge.getConnections();
      connections.value = list;
      if (editingId && activeConnectionId.value === editingId) {
        activeConnectionId.value = result.id;
      } else if (!editingId) {
        activeConnectionId.value = result.id;
      }
      addConsoleMessage(editingId ? `Updated: ${name}` : `Added: ${name} (${host}:${port})`);
      setShowAdd(false);
      setEditingId(null);
      setName('');
      setNameManuallySet(false);
      setHostStr('localhost:5000');
      setUsername('');
      setPassword('');
      setGroup('');
      setUseTls(false);
      setTestResult(null);
    } catch (e: any) {
      addConsoleMessage('Failed: ' + e.message, 'error');
    }
  };

  const handleRemove = (id: string) => {
    try {
      bridge.removeConnection(id);
      const list = bridge.getConnections();
      connections.value = list;
      if (activeConnectionId.value === id) {
        activeConnectionId.value = list.length > 0 ? list[0].id : null;
      }
      addConsoleMessage('Removed connection');
    } catch (e: any) {
      addConsoleMessage('Failed: ' + e.message, 'error');
    }
  };

  const handleTest = () => {
    const parts = hostStr.trim().split(':');
    const host = parts[0] || 'localhost';
    const port = parts.length >= 2 ? parseInt(parts[1]) || 5000 : 5000;
    setTesting(true);
    setTestResult(null);
    try {
      const r = bridge.testConnection(host, port, username.trim() || undefined, password.trim() || undefined);
      setTestResult(r.success ? '✓ Connected' : '✗ ' + (r.error || 'Failed'));
    } catch (e: any) {
      setTestResult('✗ ' + e.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSelect = (id: string) => {
    activeConnectionId.value = id;
    const conn = connections.value.find(c => c.id === id);
    if (conn) {
      try {
        const r = bridge.testConnection(conn.host, conn.port, conn.username || undefined, conn.password || undefined);
        connectionStatuses.value = { ...connectionStatuses.value, [id]: r.success ? 'connected' : 'error' };
      } catch {
        connectionStatuses.value = { ...connectionStatuses.value, [id]: 'error' };
      }
    }
  };

  const tree = buildTree(connections.value);

  const renderConn = (c: bridge.Connection, depth: number) => {
    const isActive = activeConnectionId.value === c.id;
    const liveStatus = connectionStatuses.value[c.id];
    let dot: string, dotColor: string;
    if (liveStatus === 'connected') { dot = '●'; dotColor = 'var(--status-ok)'; }
    else { dot = '●'; dotColor = 'var(--status-error)'; }

    return (
      <div key={c.id} onClick={() => handleSelect(c.id)}
        style={{
          padding: '6px 12px', cursor: 'pointer',
          background: isActive ? 'var(--bg-hover)' : 'transparent',
          borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingLeft: (12 + depth * 14) + 'px',
        }}>
        <div>
          <div style={{ color: dotColor, fontWeight: isActive ? 'bold' : 'normal' }}>
            <span style={{ marginRight: '4px' }}>{dot}</span>
            {c.name}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '1px' }}>
            {c.host}:{c.port}{c.username ? ' (' + c.username + ')' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1px' }}>
          <button onClick={(e) => { e.stopPropagation(); startEdit(c); }}
            title="Edit" style={{ background: 'transparent', color: 'var(--text-dim)', border: 'none', cursor: 'pointer', fontSize: '11px', padding: '2px 3px' }}>
            ✎
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleRemove(c.id); }}
            title="Remove" style={{ background: 'transparent', color: 'var(--text-dim)', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px 4px' }}>
            ×
          </button>
        </div>
      </div>
    );
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isExpanded = expandedGroups.has(node.fullPath);
    return (
      <div key={node.fullPath || '__root__'}>
        {node.name && (
          <div onClick={() => toggleGroup(node.fullPath)}
            style={{
              padding: '4px 8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '11px',
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'var(--bg-toolbar)', borderBottom: '1px solid #333',
              borderTop: '1px solid #333', userSelect: 'none',
              paddingLeft: (8 + depth * 14) + 'px',
            }}>
            <span style={{ fontSize: '10px' }}>{isExpanded ? '▼' : '▶'}</span>
            <span style={{ fontFamily: 'monospace' }}>{node.name}/</span>
          </div>
        )}
        {(isExpanded || !node.name) && (
          <>
            {node.conns.map(c => renderConn(c, depth + (node.name ? 1 : 0)))}
            {node.children.map(ch => renderNode(ch, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ fontSize: '12px' }}>
      {tree.conns.map(c => renderConn(c, 0))}
      {tree.children.map(ch => renderNode(ch, 0))}
      {connections.value.length === 0 && (
        <div style={{ padding: '12px', color: 'var(--text-dim)' }}>No connections. Click "+" to add.</div>
      )}

      {!showAdd ? (
        <button onClick={() => {
            setShowAdd(true);
            setEditingId(null);
            setNameManuallySet(false);
            setName(defaultName(hostStr, username, password));
          }}
          style={{ margin: '8px 12px', padding: '4px 12px', background: 'var(--accent-btn)', color: 'var(--text-white)', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px' }}>
          + New Connection
        </button>
      ) : (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ marginBottom: '4px' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Name</label>
            <input placeholder={defaultName(hostStr, username, password)} value={name}
              onInput={e => { setName((e.target as HTMLInputElement).value); setNameManuallySet(true); }}
              style={inputStyle} autoFocus />
          </div>
          <div style={{ marginBottom: '4px' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Host</label>
            <input placeholder="localhost:5000" value={hostStr}
              onInput={e => updateHost((e.target as HTMLInputElement).value)}
              style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Username</label>
              <input placeholder="user" value={username}
                onInput={e => updateUser((e.target as HTMLInputElement).value)}
                style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Password</label>
              <input type="password" placeholder="••••" value={password}
                onInput={e => updatePass((e.target as HTMLInputElement).value)}
                style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: '6px' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Group (e.g. appA/envA)</label>
            <input placeholder="appA/envA" value={group} onInput={e => setGroup((e.target as HTMLInputElement).value)}
              style={inputStyle} />
          </div>
          <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input type="checkbox" id="useTls" checked={useTls}
              onChange={e => setUseTls((e.target as HTMLInputElement).checked)}
              style={{ margin: 0 }} />
            <label htmlFor="useTls" style={{ color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>Use TLS/SSL</label>
          </div>
          {testResult && (
            <div style={{ marginBottom: '4px', fontSize: '11px', color: testResult.startsWith('✓') ? 'var(--syntax-teal)' : 'var(--status-error)' }}>
              {testResult}
            </div>
          )}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={handleSave} style={btnStyle('var(--accent-btn)')}>
              {editingId ? 'Save' : 'Add'}
            </button>
            <button onClick={handleTest} disabled={testing} style={btnStyle('var(--bg-input)')}>
              {testing ? '...' : 'Test'}
            </button>
            <button onClick={() => { setShowAdd(false); setEditingId(null); setTestResult(null); }} style={btnStyle('var(--bg-input)')}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid #555',
  padding: '4px 6px', borderRadius: '3px', fontSize: '12px', outline: 'none',
  boxSizing: 'border-box' as const, marginTop: '2px',
};

const btnStyle = (bg: string) => ({
  padding: '3px 10px', background: bg, color: 'var(--text-white)', border: '1px solid #555',
  borderRadius: '3px', cursor: 'pointer', fontSize: '12px',
});
