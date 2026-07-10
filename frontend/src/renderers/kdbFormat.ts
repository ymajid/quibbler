/**
 * Formats typed kdb+ result nodes as REPL-style inline strings — the way
 * the kdb+/q console would display them.
 *
 *   atom:    42   1b   `mysym   "c"   ::   2025-01-01
 *   list:    1 2 3                          (simple uniform)
 *            `a`b`c                         (symbol vector)
 *            (1;`a;3)                       (general list)
 *   dict:    `a`b!1 2
 *   table:   +`a`b!(1 2;3 4)               (flip notation)
 */

const MAX_DEPTH = 4;
const MAX_ITEMS = 30;

type TypedNode = Record<string, unknown>;

// ---- public entry ----

export function formatKdbInline(node: unknown, depth = 0): string {
  if (depth > MAX_DEPTH) return '…';

  // primitives (from table cells — plain values without type wrapper)
  if (node === null || node === undefined) return '::';
  if (typeof node === 'boolean') return node ? '1b' : '0b';
  if (typeof node === 'number') {
    if (Number.isInteger(node)) return String(node);
    // show up to 6 decimal places, trim trailing zeros
    const s = node.toFixed(6);
    return s.replace(/\.?0+$/, '');
  }
  if (typeof node === 'string') return node;

  // typed wrapper objects
  if (typeof node === 'object') {
    const obj = node as TypedNode;
    const type = obj.type as string;

    switch (type) {
      case 'atom':   return fmtAtom(obj);
      case 'list':   return fmtList(obj, depth);
      case 'dict':   return fmtDict(obj, depth);
      case 'table':  return fmtTable(obj, depth);
      default:       return typeof node.toString === 'function' ? node.toString() : '?';
    }
  }

  return String(node);
}

// ---- atom ----

function fmtAtom(obj: TypedNode): string {
  const v = obj.v;
  const vt = obj.vt as string;
  if (v === null || v === undefined) return '::';
  if (vt === 'boolean') return v ? '1b' : '0b';
  if (vt === 'symbol')  return '`' + String(v);
  if (vt === 'char')    return '"' + String(v) + '"';
  if (vt === 'string')  return '"' + String(v) + '"';
  if (vt === 'function') {
    if (String(v) === 'func') return 'λ';
    return String(v);
  }
  if (vt === 'byte') return String(v); // already formatted as 0xff
  // datetime / timestamp / date / time / month / minute / second / timespan — plain string
  return String(v);
}

// ---- list ----

function fmtList(obj: TypedNode, depth: number): string {
  const items = (obj.items as unknown[]) ?? [];
  if (items.length === 0) return '`$()';

  // Symbol vector — concatenate: `a`b`c
  if (items.every(isSymAtom)) {
    return items.map(it => {
      if (typeof it === 'string') return '`' + it;
      return '`' + ((it as TypedNode).v ?? '');
    }).join('');
  }

  // Simple uniform list — space-separated: 1 2 3
  if (items.every(isSimple)) {
    const limited = truncate(items, MAX_ITEMS);
    const parts = limited.map(it => fmtSimple(it));
    let s = parts.join(' ');
    if (items.length > MAX_ITEMS) s += ' …';
    return s;
  }

  // General / mixed list — (a;b;c)
  const limited = truncate(items, 10);
  const parts = limited.map(it => formatKdbInline(it, depth + 1));
  let s = '(' + parts.join(';') + ')';
  if (items.length > 10) s = s.slice(0, -1) + ';…)';
  return s;
}

// ---- dict ----

function fmtDict(obj: TypedNode, depth: number): string {
  const k = formatKdbInline(obj.keys, depth + 1);
  const v = formatKdbInline(obj.values, depth + 1);
  // Truncate if too long
  const result = k + '!' + v;
  return result.length > 300 ? result.slice(0, 297) + '…' : result;
}

// ---- table (flip notation: +`col1`col2!(col1Data;col2Data;...)) ----

function fmtTable(obj: TypedNode, depth: number): string {
  const columns = (obj.columns as Array<{ name: string }>) ?? [];
  const rows = (obj.rows as unknown[][]) ?? [];
  const rowCount = (obj.rowCount as number) ?? rows.length;

  if (columns.length === 0) return '+`$()!()';

  // Column names as symbol vector: `a`b`c
  const colSym = columns.map(c => '`' + c.name).join('');

  // Pivot rows → column vectors
  const colVectors: unknown[][] = columns.map(() => []);
  const maxRows = Math.min(rowCount, 5); // show at most 5 rows in inline view
  for (let r = 0; r < maxRows; r++) {
    const row = rows[r];
    for (let c = 0; c < columns.length; c++) {
      colVectors[c].push(c < (row?.length ?? 0) ? row[c] : null);
    }
  }

  // Format each column vector
  const colParts = colVectors.map(vec => fmtColVector(vec, depth + 1));
  const body = colParts.join(';');

  let result = '+' + colSym + '!(' + body + ')';
  if (rowCount > 5) result = result.slice(0, -1) + ';…)';
  if (result.length > 300) result = result.slice(0, 297) + '…';
  return result;
}

function fmtColVector(vec: unknown[], depth: number): string {
  if (vec.length === 0) return '()';
  if (vec.every(isSimple)) {
    return vec.map(it => fmtSimple(it)).join(' ');
  }
  const parts = vec.map(it => formatKdbInline(it, depth + 1));
  return '(' + parts.join(';') + ')';
}

// ---- helpers ----

function isSimple(item: unknown): boolean {
  if (item === null || item === undefined) return true;
  if (typeof item === 'boolean' || typeof item === 'number' || typeof item === 'string') return true;
  if (typeof item === 'object') {
    const t = (item as TypedNode).type;
    return t === 'atom';
  }
  return false;
}

function isSymAtom(item: unknown): boolean {
  if (typeof item === 'object' && item !== null) {
    const obj = item as TypedNode;
    return obj.type === 'atom' && obj.vt === 'symbol';
  }
  // In table cells symbols arrive as plain strings
  if (typeof item === 'string') return true;
  return false;
}

function fmtSimple(item: unknown): string {
  if (item === null || item === undefined) return '::';
  if (typeof item === 'boolean') return item ? '1b' : '0b';
  if (typeof item === 'number') {
    if (Number.isInteger(item)) return String(item);
    const s = item.toFixed(6);
    return s.replace(/\.?0+$/, '');
  }
  if (typeof item === 'string') return item;
  if (typeof item === 'object') {
    const obj = item as TypedNode;
    if (obj.type === 'atom') {
      if (obj.vt === 'symbol') return '`' + String(obj.v ?? '');
      if (obj.vt === 'byte') return String(obj.v ?? ''); // 0xff format
      return fmtAtom(obj);
    }
  }
  return String(item);
}

function truncate<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(0, max) : arr;
}
