import { useState, useRef, useEffect, useCallback, useMemo } from 'preact/hooks';
import type { TableResult } from '../bridge';
import { DictRenderer } from './DictRenderer';
import { ListRenderer } from './ListRenderer';
import { formatKdbInline } from './kdbFormat';

interface Props {
  result: TableResult;
}

const ROW_HEIGHT = 19;        // px per row (fontSize 11 + lineHeight 18 + border 1)
const VISIBLE_BUFFER = 20;    // extra rows above/below viewport
const MAX_ROWS = 50_000;

export function TableRenderer({ result }: Props) {
  const { columns, rows, rowCount } = result;
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [csvPrompt, setCsvPrompt] = useState(false);
  const [csvFilename, setCsvFilename] = useState('query_result.csv');

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) setSortAsc(!sortAsc);
    else { setSortCol(colIdx); setSortAsc(true); }
  };

  const toggleFilter = (colIdx: number) => {
    setFilters(prev => {
      if (prev[colIdx] !== undefined) {
        const next = { ...prev };
        delete next[colIdx];
        return next;
      }
      return { ...prev, [colIdx]: '' };
    });
  };

  const setFilter = (colIdx: number, value: string) => {
    setFilters(prev => ({ ...prev, [colIdx]: value }));
  };

  // Remove a filter when Escape is pressed
  const removeFilter = (colIdx: number) => {
    setFilters(prev => {
      const next = { ...prev };
      delete next[colIdx];
      return next;
    });
  };

  // Apply all active filters (AND logic). Memoized so scrolling — which only
  // changes scrollTop — never re-runs the filter over every row.
  const hasActiveFilters = Object.values(filters).some(v => v.trim());
  const filteredRows = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v.trim());
    if (active.length === 0) return rows;   // no copy in the common case
    let out = rows;
    for (const [colStr, q] of active) {
      const colIdx = parseInt(colStr);
      const lower = q.toLowerCase();
      out = out.filter(row => {
        const val = row[colIdx];
        if (val === null || val === undefined) return lower === '::' || lower === '';
        return formatKdbInline(val).toLowerCase().includes(lower);
      });
    }
    return out;
  }, [rows, filters]);

  // ---- Column resize ----
  const resizing = useRef<{ col: number; startX: number; startWidth: number } | null>(null);
  const headerRefs = useRef<(HTMLTableHeaderCellElement | null)[]>([]);

  const onResizeStart = useCallback((colIdx: number, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Read actual rendered width from the DOM
    const th = headerRefs.current[colIdx];
    const actualWidth = th ? th.getBoundingClientRect().width : 80;
    resizing.current = { col: colIdx, startX: e.clientX, startWidth: actualWidth };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const delta = e.clientX - resizing.current.startX;
      const newWidth = Math.max(30, resizing.current.startWidth + delta);
      setColWidths(prev => ({ ...prev, [resizing.current!.col]: newWidth }));
    };
    const onUp = () => { resizing.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ---- Row limit + sorting (memoized: independent of scroll position) ----
  const truncated = filteredRows.length > MAX_ROWS;
  const sortedRows = useMemo(() => {
    const base = truncated ? filteredRows.slice(0, MAX_ROWS) : filteredRows;
    if (sortCol === null) return base;   // no copy/sort when unsorted
    const arr = base.slice();
    arr.sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [filteredRows, sortCol, sortAsc, truncated]);

  const hasManualWidths = Object.keys(colWidths).length > 0;

  const cols = (columns as Array<{ name: string }>) ?? [];

  // CSV export
  const doExportCsv = () => {
    const header = cols.map(c => c.name).join(',');
    const body = filteredRows.map(row =>
      row.map(v => {
        const s = formatKdbInline(v);
        // Quote fields containing commas, quotes, or newlines
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',')
    ).join('\n');
    const csv = header + '\n' + body;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = csvFilename || 'query_result.csv'; a.click();
    URL.revokeObjectURL(url);
    setCsvPrompt(false);
  };

  // Copy all as TSV
  const copyAll = () => {
    const header = cols.map(c => c.name).join('\t');
    const body = filteredRows.map(row => row.map(v => formatKdbInline(v)).join('\t')).join('\n');
    const tsv = header + '\n' + body;
    navigator.clipboard?.writeText(tsv).catch(() => {});
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 12px', fontSize: '11px', color: 'var(--text-secondary)',
        borderBottom: '1px solid var(--border)', flexShrink: 0, gap: '8px',
      }}>
        <span>
          {truncated
            ? `Showing ${MAX_ROWS.toLocaleString()} of ${filteredRows.length.toLocaleString()} matches`
            : hasActiveFilters
              ? `${filteredRows.length.toLocaleString()} of ${rowCount.toLocaleString()} rows`
              : `${rowCount.toLocaleString()} rows × ${columns.length} columns`}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ cursor: 'pointer' }} onClick={copyAll}
            title="Copy all rows as tab-separated text">📋 Copy All</span>
          {csvPrompt ? (
            <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input value={csvFilename}
                onInput={e => setCsvFilename((e.target as HTMLInputElement).value)}
                onKeyDown={e => { if (e.key === 'Enter') doExportCsv(); if (e.key === 'Escape') setCsvPrompt(false); }}
                placeholder="query_result.csv"
                autoFocus
                style={{
                  background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid #4ec9b0',
                  padding: '1px 4px', borderRadius: '2px', fontSize: '11px', outline: 'none',
                  width: '130px', fontFamily: 'inherit',
                }} />
              <span onClick={doExportCsv} style={{ cursor: 'pointer', color: 'var(--syntax-teal)', fontSize: '11px' }}>Save</span>
              <span onClick={() => setCsvPrompt(false)} style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '11px' }}>✕</span>
            </span>
          ) : (
            <span style={{ cursor: 'pointer' }} onClick={() => { setCsvFilename('query_result.csv'); setCsvPrompt(true); }}
              title="Download as CSV">📥 CSV</span>
          )}
          <span style={{ cursor: 'pointer' }} onClick={() => window.dispatchEvent(new CustomEvent('quibbler:autoSize'))}
            title="Auto-size columns (Ctrl+J)">↕ Fit</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={() => { if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop); }}
        style={{ flex: 1, overflow: 'auto' }}>
        <table style={{
          // width:100% + a greedy trailing spacer column packs the real columns
          // tight against the left; the spacer soaks up any leftover width so
          // columns sit as close together as their content allows.
          borderCollapse: 'collapse', borderSpacing: '0', fontSize: '11px',
          fontFamily: 'monospace', width: '100%', tableLayout: 'auto',
        }}>
          {hasManualWidths && (
            <colgroup>
              <col style={{ width: '28px', minWidth: '28px' }} />
              {columns.map((_col: unknown, i: number) => (
                <col key={i} style={{ width: colWidths[i] ? colWidths[i] + 'px' : 'auto' }} />
              ))}
              <col style={{ width: '100%' }} />
            </colgroup>
          )}
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '28px', minWidth: '28px' }}>#</th>
              {columns.map((col: { name: string; type: string; isKey?: boolean }, i: number) => {
                const isFiltering = filters[i] !== undefined;
                return (
                <th key={i}
                  ref={(el) => { headerRefs.current[i] = el; }}
                  style={{
                    ...thStyle,
                    position: 'relative',
                    background: col.isKey ? 'var(--bg-keycol)' : thStyle.background,
                    borderRight: col.isKey ? '2px solid #2a5568' : undefined,
                    borderBottom: isFiltering ? '1px solid #4ec9b0' : thStyle.borderBottom,
                    width: colWidths[i] ? colWidths[i] + 'px' : undefined,
                    verticalAlign: 'top',
                  }}>
                  <div onClick={() => { if (!isFiltering) toggleFilter(i); else handleSort(i); }}
                    style={{ cursor: 'pointer', lineHeight: '18px' }}>
                    <span style={{ color: sortCol === i ? 'var(--syntax-teal)' : col.isKey ? 'var(--keycol-text)' : 'var(--text-secondary)' }}>
                      {col.name}{sortCol === i && (sortAsc ? ' ↑' : ' ↓')}
                    </span>
                    {!isFiltering && (
                      <span style={{ color: col.isKey ? 'var(--keycol-dim)' : 'var(--border-strong)', marginLeft: '4px', fontWeight: 'normal' }}>{col.type}</span>
                    )}
                  </div>
                  {isFiltering && (
                    <input
                      value={filters[i] ?? ''}
                      onInput={e => setFilter(i, (e.target as HTMLInputElement).value)}
                      onKeyDown={e => { if (e.key === 'Escape') removeFilter(i); }}
                      placeholder="filter…"
                      autoFocus
                      style={{
                        width: '100%', background: 'var(--bg-input)', color: 'var(--syntax-teal)',
                        border: '1px solid #4ec9b0', padding: '0 4px',
                        borderRadius: '2px', fontSize: '11px', outline: 'none',
                        fontFamily: 'inherit', boxSizing: 'border-box',
                        marginTop: '2px',
                      }}
                    />
                  )}
                  {/* Resize handle */}
                  <div
                    onMouseDown={(e) => onResizeStart(i, e)}
                    style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0,
                      width: '5px', cursor: 'col-resize', background: 'transparent',
                      zIndex: 2,
                    }}
                  />
                </th>
              );})}
              {/* Greedy spacer: absorbs leftover width so real columns stay tight-left */}
              <th aria-hidden="true" style={{ ...thStyle, width: '100%', padding: 0 }} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length > 0 && (() => {
              const viewHeight = scrollRef.current?.clientHeight ?? 400;
              const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VISIBLE_BUFFER);
              const visibleCount = Math.ceil(viewHeight / ROW_HEIGHT) + VISIBLE_BUFFER * 2;
              const endIdx = Math.min(sortedRows.length, startIdx + visibleCount);
              const visibleRows = sortedRows.slice(startIdx, endIdx);

              return <>
                {startIdx > 0 && <tr style={{ height: startIdx * ROW_HEIGHT }}><td colSpan={columns.length + 2} /></tr>}
                {visibleRows.map((row: unknown[], ri: number) => {
                  const absIdx = startIdx + ri;
                  return (
                    <tr key={absIdx} style={{ height: ROW_HEIGHT, background: absIdx % 2 === 0 ? 'var(--bg)' : 'var(--bg-row-alt)' }}>
                      <td style={{ ...tdStyle, color: 'var(--border-strong)', textAlign: 'right', width: '28px', fontSize: '11px' }}>{absIdx}</td>
                      {row.map((val: unknown, ci: number) => {
                        const col = (columns as Array<{type?: string; isKey?: boolean}>)[ci];
                        const isSym = col?.type === 'symbol';
                        return (
                          <td key={ci} style={{
                            ...tdStyle,
                            background: col?.isKey ? 'var(--bg-keycol)' : undefined,
                            borderRight: col?.isKey ? '2px solid var(--keycol-border)' : undefined,
                          }}
                            onClick={() => {
                              // Copy symbols with their backtick so they paste straight back into q.
                              const text = typeof val === 'object' && val !== null
                                ? formatKdbInline(val)
                                : (isSym && typeof val === 'string' ? '`' + val : String(val ?? '::'));
                              if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
                            }}
                            title="Click to copy">
                            <CellValue val={val} sym={isSym} />
                          </td>
                        );
                      })}
                      {/* Spacer cell — matches the header's greedy column */}
                      <td style={{ borderBottom: tdStyle.borderBottom }} />
                    </tr>
                  );
                })}
                {endIdx < sortedRows.length && <tr style={{ height: (sortedRows.length - endIdx) * ROW_HEIGHT }}><td colSpan={columns.length + 2} /></tr>}
              </>;
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Cell value renderer — shows REPL-style inline text, expandable for nested types ----

function CellValue({ val, sym }: { val: unknown; sym?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  // --- primitives ---
  if (val === null || val === undefined) {
    return <span style={{ color: 'var(--border-strong)', fontStyle: 'italic' }}>::</span>;
  }
  if (typeof val === 'boolean') {
    return <span style={{ color: 'var(--syntax-blue)' }}>{val ? '1b' : '0b'}</span>;
  }
  if (typeof val === 'number') {
    const text = Number.isInteger(val) ? String(val) : val.toFixed(6).replace(/\.?0+$/, '');
    return <span style={{ color: 'var(--syntax-number)' }}>{text}</span>;
  }
  if (typeof val === 'string') {
    // kdb null/infinity sentinels arrive as strings (0Wi, 0Ni, 0w, 0n, …) — show
    // them in the number colour, not string-red.
    if (/^-?0[WwNn][hijef]?$/.test(val)) {
      return <span style={{ color: 'var(--syntax-number)' }}>{val}</span>;
    }
    // Symbol columns show a leading backtick (kdb style) so a copied cell pastes back into q.
    return <span style={{ color: 'var(--syntax-string)' }}>{sym ? '`' + val : val}</span>;
  }

  if (typeof val !== 'object') {
    return <span style={{ color: 'var(--text)' }}>{String(val)}</span>;
  }

  const obj = val as Record<string, unknown>;
  const type = obj.type as string;

  // --- wrapped atom ---
  if (type === 'atom') {
    const v = obj.v;
    const vt = obj.vt as string;
    if (v === null || v === undefined) return <span style={{ color: 'var(--border-strong)', fontStyle: 'italic' }}>::</span>;
    if (vt === 'boolean') return <span style={{ color: 'var(--syntax-blue)' }}>{v ? '1b' : '0b'}</span>;
    if (vt === 'symbol') return <span style={{ color: 'var(--syntax-string)' }}>{'`' + String(v)}</span>;
    if (vt === 'char') return <span style={{ color: 'var(--syntax-string)' }}>{'"' + String(v) + '"'}</span>;
    if (vt === 'byte') return <span style={{ color: 'var(--syntax-number)' }}>{String(v)}</span>;
    if (vt === 'function') return <span style={{ color: 'var(--syntax-purple)' }}>{String(v) === 'func' ? 'λ' : String(v)}</span>;
    if (vt === 'datetime' || vt === 'timestamp' || vt === 'date' || vt === 'time' ||
        vt === 'month' || vt === 'minute' || vt === 'second' || vt === 'timespan')
      return <span style={{ color: 'var(--syntax-teal)' }}>{String(v)}</span>;
    return <span style={{ color: 'var(--text)' }}>{String(v)}</span>;
  }

  // --- nested complex types — show REPL inline + expandable ---
  if (type === 'dict' || type === 'table' || type === 'list') {
    const inline = formatKdbInline(val);
    const expandable = inline.length > 30 || type === 'table';
    const accentColor = type === 'table' ? 'var(--syntax-teal)' : type === 'dict' ? 'var(--syntax-yellow)' : 'var(--syntax-ltblue)';

    return (
      <span>
        <span onClick={() => setExpanded(!expanded)}
          title={expandable ? 'Click to expand' : undefined}
          style={{
            cursor: 'pointer', color: accentColor,
            whiteSpace: 'nowrap',
          }}>
          {expandable && <span style={{ color: 'var(--text-dim)', marginRight: '3px', fontSize: '10px' }}>{expanded ? '▼' : '▶'}</span>}
          {inline}
        </span>
        {expanded && (
          <div style={{
            padding: '4px 0 4px 12px', maxHeight: '300px', maxWidth: '500px',
            overflow: 'auto', borderLeft: '2px solid ' + accentColor, marginTop: '2px',
          }}>
            {type === 'table' && <TableRenderer result={obj as unknown as TableResult} />}
            {type === 'dict' && <DictRenderer result={obj as any} />}
            {type === 'list' && <ListRenderer result={obj as any} />}
          </div>
        )}
      </span>
    );
  }

  // fallback
  return <span style={{ color: 'var(--text-secondary)' }}>{JSON.stringify(val)}</span>;
}

const thStyle = {
  position: 'sticky' as const, top: 0, background: 'var(--bg-panel)', color: 'var(--text-secondary)',
  fontWeight: 'bold', padding: '0 4px', textAlign: 'left' as const,
  borderBottom: '2px solid #555', whiteSpace: 'nowrap' as const, zIndex: 1,
  overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '11px',
  lineHeight: '18px',
};

const tdStyle = {
  padding: '0 4px', borderBottom: '1px solid #222', whiteSpace: 'nowrap' as const,
  overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' as const,
  maxWidth: '500px', fontSize: '11px', lineHeight: '18px',
};
