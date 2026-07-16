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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const toggleGroup = (g: string) => {
    const next = new Set(expandedGroups);
    if (next.has(g)) next.delete(g); else next.add(g);
    setExpandedGroups(next);
  };

  // ---- Group / folder operations ----
  const refresh = () => { connections.value = bridge.getConnections(); };

  // Move a connection into a folder (empty string = ungrouped).
  const moveTo = (connId: string, groupPath: string) => {
    const c = connections.value.find(x => x.id === connId);
    if (c && (c.group || '') === (groupPath || '')) return;   // already there — no-op
    try { bridge.moveConnection(connId, groupPath); refresh(); }
    catch (e: any) { addConsoleMessage('Move failed: ' + e.message, 'error'); }
  };

  // Connections directly in `path` or any of its subfolders.
  const connsUnder = (path: string) =>
    connections.value.filter(c => c.group === path || (c.group || '').startsWith(path + '/'));

  const renameGroup = (oldPath: string, newName: string) => {
    const clean = newName.trim().replace(/^\/+|\/+$/g, '');
    setRenamingGroup(null);
    if (!clean || clean === oldPath.split('/').pop()) return;
    const slash = oldPath.lastIndexOf('/');
    const newPath = slash >= 0 ? oldPath.slice(0, slash + 1) + clean : clean;
    for (const c of connsUnder(oldPath)) {
      const suffix = (c.group || '').slice(oldPath.length);   // '' or '/sub…'
      try { bridge.moveConnection(c.id, newPath + suffix); } catch { /* keep going */ }
    }
    refresh();
    addConsoleMessage(`Renamed folder ${oldPath} → ${newPath}`);
  };

  const deleteGroup = (path: string) => {
    const affected = connsUnder(path);
    if (!confirm(`Delete folder "${path}" and its ${affected.length} connection${affected.length !== 1 ? 's' : ''}?`)) return;
    for (const c of affected) {
      try { bridge.removeConnection(c.id); } catch { /* keep going */ }
      if (activeConnectionId.value === c.id) activeConnectionId.value = null;
    }
    refresh();
    addConsoleMessage(`Deleted folder ${path}`);
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
    // green = connected · red = error/unreachable · grey = not yet probed / checking
    const dot = '●';
    const dotColor = liveStatus === 'connected' ? 'var(--status-ok)'
      : (liveStatus === 'error' || liveStatus === 'disconnected') ? 'var(--status-error)'
      : 'var(--text-dim)';
    const statusLabel = liveStatus === 'connected' ? 'Connected'
      : (liveStatus === 'error' || liveStatus === 'disconnected') ? 'Unreachable'
      : 'Checking…';

    return (
      <div key={c.id} onClick={() => handleSelect(c.id)}
        draggable
        onDragStart={(e) => { setDraggingId(c.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDraggingId(null); setDragOverGroup(null); }}
        style={{
          padding: '6px 12px', cursor: 'pointer',
          background: isActive ? 'var(--bg-hover)' : 'transparent',
          borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingLeft: (12 + depth * 14) + 'px',
          opacity: draggingId === c.id ? 0.4 : 1,
        }}>
        <div>
          <div style={{ color: 'var(--text-bright)', fontWeight: isActive ? 'bold' : 'normal' }}>
            <span title="Drag to a folder" style={{ cursor: 'grab', color: 'var(--text-dim)', marginRight: '3px', fontSize: '10px' }}>⠿</span>
            <span title={statusLabel} style={{ color: dotColor, marginRight: '4px' }}>{dot}</span>
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
    const isDropTarget = dragOverGroup === node.fullPath;
    const isRenaming = renamingGroup === node.fullPath;
    return (
      <div key={node.fullPath || '__root__'}>
        {node.name && (
          <div onClick={() => { if (!isRenaming) toggleGroup(node.fullPath); }}
            onDragOver={(e) => { if (draggingId) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; setDragOverGroup(node.fullPath); } }}
            onDragLeave={(e) => { if (dragOverGroup === node.fullPath && !e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroup(null); }}
            onDrop={(e) => { e.preventDefault(); if (draggingId) moveTo(draggingId, node.fullPath); setDraggingId(null); setDragOverGroup(null); }}
            style={{
              padding: '4px 8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '11px',
              display: 'flex', alignItems: 'center', gap: '4px',
              background: isDropTarget ? 'var(--bg-hover)' : 'var(--bg-toolbar)',
              borderBottom: '1px solid #333',
              borderTop: '1px solid #333', userSelect: 'none',
              boxShadow: isDropTarget ? 'inset 0 0 0 1px var(--accent)' : 'none',
              paddingLeft: (8 + depth * 14) + 'px',
            }}>
            <span style={{ fontSize: '10px' }}>{isExpanded ? '▼' : '▶'}</span>
            {isRenaming ? (
              <input value={renameValue} autoFocus
                onClick={e => e.stopPropagation()}
                onInput={e => setRenameValue((e.target as HTMLInputElement).value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') renameGroup(node.fullPath, renameValue);
                  else if (e.key === 'Escape') setRenamingGroup(null);
                }}
                onBlur={() => renameGroup(node.fullPath, renameValue)}
                style={{ flex: 1, background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid var(--accent)', padding: '1px 4px', borderRadius: '2px', fontSize: '11px', fontFamily: 'monospace', outline: 'none' }} />
            ) : (
              <>
                <span style={{ fontFamily: 'monospace', flex: 1 }}>{node.name}/</span>
                <button onClick={(e) => { e.stopPropagation(); setRenamingGroup(node.fullPath); setRenameValue(node.name); }}
                  title="Rename folder" style={{ background: 'transparent', color: 'var(--text-dim)', border: 'none', cursor: 'pointer', fontSize: '11px', padding: '1px 3px' }}>
                  ✎
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteGroup(node.fullPath); }}
                  title="Delete folder and its connections" style={{ background: 'transparent', color: 'var(--text-dim)', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '1px 3px' }}>
                  ×
                </button>
              </>
            )}
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

  // Whether the connection currently being dragged is inside a folder (so the
  // top-level strip should invite an ungroup).
  const draggingConn = draggingId ? connections.value.find(c => c.id === draggingId) : null;
  const showUngroup = !!draggingConn && !!draggingConn.group;
  const rootActive = dragOverGroup === '__root__';

  return (
    <div style={{ fontSize: '12px' }}>
      {/* Always-present top-level drop target when any folder exists. Rendering it
          unconditionally (not just while dragging) keeps the folder headers from
          shifting the instant a drag starts — a mid-drag layout shift makes the
          browser's drop hit-testing land on the wrong row. */}
      {tree.children.length > 0 && (
        <div
          onDragOver={(e) => { if (draggingId) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; setDragOverGroup('__root__'); } }}
          onDragLeave={(e) => { if (rootActive && !e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroup(null); }}
          onDrop={(e) => { e.preventDefault(); if (draggingId) moveTo(draggingId, ''); setDraggingId(null); setDragOverGroup(null); }}
          style={{
            padding: '3px 12px', fontSize: '10px', userSelect: 'none',
            color: showUngroup ? 'var(--text-secondary)' : 'var(--text-dim)',
            borderBottom: '1px solid #333',
            background: rootActive ? 'var(--bg-hover)' : 'transparent',
            boxShadow: rootActive ? 'inset 0 0 0 1px var(--accent)' : 'none',
          }}>
          {showUngroup ? '⤴ Drop here to move to top level' : '⌂ Top level'}
        </div>
      )}
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
