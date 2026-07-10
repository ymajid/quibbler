import { useState } from 'preact/hooks';
import type { ListResult } from '../bridge';
import { DictRenderer } from './DictRenderer';
import { TableRenderer } from './TableRenderer';
import { formatKdbInline } from './kdbFormat';

interface Props {
  result: ListResult;
}

export function ListRenderer({ result }: Props) {
  const items = (result.items || []) as any[];

  // Detect matrix: all items are lists of the same length
  const isMatrix = items.length > 0
    && items.every((it: any) => it && it.type === 'list')
    && items.every((it: any, _i: number, arr: any[]) =>
      (it.items?.length ?? 0) === (arr[0]?.items?.length ?? 0));

  // Detect flat simple list
  const isFlat = items.every((it: any) => {
    if (it === null || it === undefined) return true;
    if (typeof it === 'boolean' || typeof it === 'number' || typeof it === 'string') return true;
    if (typeof it === 'object' && it.type === 'atom') return true;
    return false;
  });

  // Matrix — render as REPL grid: each row on its own line
  if (isMatrix && items.length > 1) {
    const rowCount = items.length;
    const colCount = items[0]?.items?.length ?? 0;
    return (
      <div style={{ padding: '4px 0', fontFamily: 'monospace', fontSize: '12px', overflow: 'auto' }}>
        <div style={{ padding: '2px 12px', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
          {rowCount}×{colCount} matrix
        </div>
        {items.map((row: any, ri: number) => (
          <div key={ri} style={{ padding: '0 12px', lineHeight: '18px', whiteSpace: 'pre', color: 'var(--text)' }}>
            {(row.items || []).map((val: any) => formatKdbInline(val)).join(' ')}
          </div>
        ))}
      </div>
    );
  }

  // Flat simple list — render inline like REPL: 0 1 2 3 ...
  if (isFlat && items.length <= 200) {
    return (
      <div style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '13px', overflow: 'auto' }}>
        <div style={{ color: 'var(--text)', lineHeight: '22px', wordBreak: 'break-all' }}>
          {items.map((it: any) => formatKdbInline(it)).join(' ')}
        </div>
      </div>
    );
  }

  // Complex/mixed list — expandable per item
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '4px 12px', fontSize: '11px', color: 'var(--text-secondary)',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        List — {items.length} items
      </div>
      <div style={{ flex: 1, overflow: 'auto', fontFamily: 'monospace', fontSize: '12px' }}>
        {items.map((item: unknown, i: number) => (
          <ListItem key={i} index={i} item={item} />
        ))}
      </div>
    </div>
  );
}

function ListItem({ index, item }: { index: number; item: any }) {
  const [expanded, setExpanded] = useState(false);

  if (item === null || item === undefined) {
    return (
      <div style={{ padding: '0 12px', display: 'flex', lineHeight: '18px' }}>
        <span style={{ color: 'var(--border-strong)', minWidth: '32px', flexShrink: 0, textAlign: 'right', marginRight: '6px' }}>[{index}]</span>
        <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>::</span>
      </div>
    );
  }

  if (typeof item === 'object' && item !== null && 'type' in item) {
    if (item.type === 'table') {
      return (
        <div>
          <div onClick={() => setExpanded(!expanded)} style={{ padding: '0 12px', display: 'flex', cursor: 'pointer', lineHeight: '18px' }}>
            <span style={{ color: 'var(--border-strong)', minWidth: '32px', flexShrink: 0, textAlign: 'right', marginRight: '6px' }}>
              {expanded ? '▼' : '▶'} [{index}]
            </span>
            <span style={{ color: 'var(--syntax-teal)' }}>{formatKdbInline(item)}</span>
          </div>
          {expanded && <div style={{ marginLeft: '38px' }}><TableRenderer result={item} /></div>}
        </div>
      );
    }

    if (item.type === 'atom') {
      return (
        <div style={{ padding: '0 12px', display: 'flex', lineHeight: '18px' }}>
          <span style={{ color: 'var(--border-strong)', minWidth: '32px', flexShrink: 0, textAlign: 'right', marginRight: '6px' }}>[{index}]</span>
          <span style={{ color: 'var(--text)' }}>{formatKdbInline(item)}</span>
        </div>
      );
    }

    // Nested dict or list
    return (
      <div>
        <div onClick={() => setExpanded(!expanded)} style={{ padding: '0 12px', display: 'flex', cursor: 'pointer', lineHeight: '18px' }}>
          <span style={{ color: 'var(--border-strong)', minWidth: '32px', flexShrink: 0, textAlign: 'right', marginRight: '6px' }}>
            {expanded ? '▼' : '▶'} [{index}]
          </span>
          <span style={{ color: item.type === 'dict' ? 'var(--syntax-yellow)' : 'var(--syntax-ltblue)' }}>{formatKdbInline(item)}</span>
        </div>
        {expanded && (
          <div style={{ borderLeft: '1px solid #444', marginLeft: '38px' }}>
            {item.type === 'dict' && <DictRenderer result={item} />}
            {item.type === 'list' && <ListRenderer result={item} />}
          </div>
        )}
      </div>
    );
  }

  // Plain scalar
  return (
    <div style={{ padding: '0 12px', display: 'flex', lineHeight: '18px' }}>
      <span style={{ color: 'var(--border-strong)', minWidth: '32px', flexShrink: 0, textAlign: 'right', marginRight: '6px' }}>[{index}]</span>
      <span style={{ color: 'var(--text)' }}>{String(item)}</span>
    </div>
  );
}
