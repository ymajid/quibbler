import { useState } from 'preact/hooks';
import type { DictResult } from '../bridge';
import { TableRenderer } from './TableRenderer';
import { ListRenderer } from './ListRenderer';
import { formatKdbInline } from './kdbFormat';

interface Props {
  result: DictResult;
}

export function DictRenderer({ result }: Props) {
  return (
    <div style={{ fontFamily: 'monospace', fontSize: '12px', overflow: 'auto' }}>
      <DictNode keys={result.keys} values={result.values} depth={0} />
    </div>
  );
}

function DictNode({ keys, values, depth }: { keys: any; values: any; depth: number }) {
  const keyList = extractItems(keys);
  const valList = extractItems(values);
  const entries: Array<{ key: any; value: any }> = [];
  const len = Math.min(keyList.length, valList.length);
  for (let i = 0; i < len; i++) {
    entries.push({ key: keyList[i], value: valList[i] });
  }

  // Calculate key column width — account for expand arrow (1 char)
  const hasExpandable = entries.some(e => isExpandable(e.value));
  const rawMaxKeyLen = Math.max(...entries.map(e => renderKey(e.key).length), 0);
  const maxKeyLen = hasExpandable ? rawMaxKeyLen + 1 : rawMaxKeyLen; // +1 for ▶/▼
  const keyColCh = Math.max(4, Math.min(maxKeyLen, 40));

  // At depth>0, the parent's expanded-area div already handles the | alignment.
  // Only add a small indent so nested keys don't sit flush against the border.
  const outerPad = depth > 0 ? '16px' : '0px';

  return (
    <div style={{ paddingLeft: outerPad }}>
      {entries.map((entry, i) => (
        <DictRow key={i} entry={entry} depth={depth} keyColCh={keyColCh} />
      ))}
    </div>
  );
}

function DictRow({ entry, depth, keyColCh }: {
  entry: { key: any; value: any };
  depth: number;
  keyColCh: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const valueIsNested = isExpandable(entry.value);
  const keyStr = renderKey(entry.key);

  return (
    <div>
      <div
        onClick={() => valueIsNested && setExpanded(!expanded)}
        style={{
          display: 'flex', padding: '0px 0', lineHeight: '18px',
          cursor: valueIsNested ? 'pointer' : 'default',
          minHeight: '18px',
        }}>
        {/* Key column: arrow + key, left-aligned, fixed width */}
        <span style={{
          color: 'var(--syntax-ltblue)', flexShrink: 0, textAlign: 'left',
          width: keyColCh + 'ch', overflow: 'hidden',
        }}>
          {valueIsNested && <span style={{ color: 'var(--border-strong)' }}>{expanded ? '▼' : '▶'}</span>}
          {!valueIsNested && <span style={{ visibility: 'hidden' }}>▶</span>}
          {keyStr}
        </span>
        {/* Separator — always at fixed position from left */}
        <span style={{ color: 'var(--border-strong)', flexShrink: 0, marginRight: '4px' }}>|</span>
        {/* Value */}
        <span style={{ color: valueColor(entry.value), wordBreak: 'break-all' }}>
          {formatKdbInline(entry.value)}
        </span>
      </div>

      {expanded && valueIsNested && (
        <div style={{
          marginLeft: 'calc(' + keyColCh + 'ch + 1ch)',
          paddingLeft: '0px',
          borderLeft: '1px solid #444',
        }}>
          <NestedNode node={entry.value} depth={depth + 1} />
        </div>
      )}
    </div>
  );
}

function NestedNode({ node, depth }: { node: any; depth: number }) {
  if (node === null || node === undefined) {
    return <div style={{ color: 'var(--text-dim)' }}>::</div>;
  }

  if (node.type === 'table') {
    return (
      <div style={{ padding: '2px 0' }}>
        <TableRenderer result={node} />
      </div>
    );
  }

  if (node.type === 'atom') {
    return <div style={{ color: valueColor(node) }}>{formatKdbInline(node)}</div>;
  }

  if (node.type === 'dict') {
    return <DictNode keys={node.keys} values={node.values} depth={depth} />;
  }

  if (node.type === 'list') {
    const items = node.items || [];
    // Simple lists — show inline
    if (items.every((it: any) => !isExpandable(it))) {
      return <div style={{ color: 'var(--text)' }}>{formatKdbInline(node)}</div>;
    }
    // Complex lists — show indexed
    return (
      <div>
        {items.map((item: any, i: number) => (
          <div key={i} style={{ display: 'flex', lineHeight: '18px' }}>
            <span style={{ color: 'var(--border-strong)', minWidth: '28px', flexShrink: 0, textAlign: 'right', marginRight: '4px' }}>
              [{i}]
            </span>
            {isExpandable(item) ? (
              <NestedNode node={item} depth={depth + 1} />
            ) : (
              <span style={{ color: valueColor(item) }}>{formatKdbInline(item)}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return <div style={{ color: 'var(--text)' }}>{formatKdbInline(node)}</div>;
}

// ---- helpers ----

function isExpandable(node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  const t = node.type;
  return t === 'dict' || t === 'list' || t === 'table';
}

function extractItems(node: any): any[] {
  if (!node) return [];
  if (Array.isArray(node)) return node;
  if (node.type === 'list') return node.items || [];
  if (node.type === 'atom') return [node];
  return [];
}

/** Render a key for display — symbols get backtick in REPL style */
function renderKey(node: any): string {
  if (node === null || node === undefined) return '::';
  if (typeof node === 'object' && node.type === 'atom') {
    const v = node.v;
    if (v === null || v === undefined) return '::';
    if (node.vt === 'symbol') return '`' + String(v);
    return String(v);
  }
  if (typeof node === 'string') return node; // plain string key from table cells
  return String(node);
}

function describeValue(node: any): string {
  if (!node || typeof node !== 'object') return String(node);
  const t = node.type;
  if (t === 'dict') {
    const keys = node.keys;
    const n = keys?.type === 'list' ? (keys.length ?? keys.items?.length ?? 0) : 0;
    return `{dict: ${n} keys}`;
  }
  if (t === 'table') {
    const n = node.rowCount ?? node.rows?.length ?? 0;
    const c = node.columns?.length ?? 0;
    return `{table: ${c} cols × ${n} rows}`;
  }
  if (t === 'list') {
    const n = node.length ?? node.items?.length ?? 0;
    return `{list: ${n} items}`;
  }
  return `{${t}}`;
}

function valueColor(node: any): string {
  if (!node) return 'var(--text-dim)';
  if (typeof node !== 'object') return 'var(--text)';
  const vt = node.vt || '';
  if (node.type === 'dict') return 'var(--syntax-yellow)';
  if (node.type === 'table') return 'var(--syntax-teal)';
  if (node.type === 'list') return 'var(--syntax-ltblue)';
  switch (vt) {
    case 'symbol': case 'char': case 'string': return 'var(--syntax-string)';
    case 'int': case 'long': case 'short': case 'real': case 'float':
    case 'byte': return 'var(--syntax-number)';
    case 'boolean': return 'var(--syntax-blue)';
    case 'timestamp': case 'date': case 'time': case 'datetime':
    case 'month': case 'minute': case 'second': case 'timespan': return 'var(--syntax-teal)';
    case 'function': return 'var(--syntax-purple)';
    default: return 'var(--text)';
  }
}
