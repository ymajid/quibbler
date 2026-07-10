/**
 * Tests for the kdb+ REPL formatter (formatKdbInline).
 * Run: import in browser console or via a test runner.
 */

import { formatKdbInline } from '../renderers/kdbFormat';

let passed = 0;
let failed = 0;

function assert(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

export function runTests() {
  passed = 0; failed = 0;

  // ---- Primitives ----
  assert(formatKdbInline(null), '::', 'null → ::');
  assert(formatKdbInline(undefined), '::', 'undefined → ::');
  assert(formatKdbInline(true), '1b', 'boolean true');
  assert(formatKdbInline(false), '0b', 'boolean false');
  assert(formatKdbInline(42), '42', 'integer');
  assert(formatKdbInline(0), '0', 'zero');
  assert(formatKdbInline(-5), '-5', 'negative int');
  assert(formatKdbInline(3.14), '3.14', 'float');
  assert(formatKdbInline('hello'), 'hello', 'plain string');

  // ---- Typed atoms ----
  assert(formatKdbInline({ type: 'atom', v: null, vt: 'null' }), '::', 'typed null');
  assert(formatKdbInline({ type: 'atom', v: true, vt: 'boolean' }), '1b', 'typed boolean true');
  assert(formatKdbInline({ type: 'atom', v: false, vt: 'boolean' }), '0b', 'typed boolean false');
  assert(formatKdbInline({ type: 'atom', v: 'mysym', vt: 'symbol' }), '`mysym', 'typed symbol');
  assert(formatKdbInline({ type: 'atom', v: 'c', vt: 'char' }), '"c"', 'typed char');
  assert(formatKdbInline({ type: 'atom', v: 'hello', vt: 'string' }), '"hello"', 'typed string');
  assert(formatKdbInline({ type: 'atom', v: '2025.01.01', vt: 'date' }), '2025.01.01', 'date');
  assert(formatKdbInline({ type: 'atom', v: 'func', vt: 'function' }), 'λ', 'function displays as lambda');
  assert(formatKdbInline({ type: 'atom', v: '0xff', vt: 'byte' }), '0xff', 'byte hex');

  // ---- Simple uniform list ----
  const simpleList = formatKdbInline({ type: 'list', items: [1, 2, 3], length: 3 });
  assert(simpleList.includes('1 2 3'), true, 'simple list space-separated');

  // ---- Symbol vector ----
  const symVec = formatKdbInline({
    type: 'list', items: [
      { type: 'atom', v: 'a', vt: 'symbol' },
      { type: 'atom', v: 'b', vt: 'symbol' },
    ]
  });
  assert(symVec, '`a`b', 'symbol vector concatenated');

  // ---- General list ----
  const generalList = formatKdbInline({
    type: 'list', items: [1, { type: 'atom', v: 'a', vt: 'symbol' }]
  });
  assert(generalList.includes('('), true, 'general list has opening paren');
  assert(generalList.includes(';'), true, 'general list has semicolons');
  assert(generalList.includes(')'), true, 'general list has closing paren');

  // ---- Empty list ----
  assert(formatKdbInline({ type: 'list', items: [] }), '`$()', 'empty list');

  // ---- Dict ----
  const dictStr = formatKdbInline({
    type: 'dict',
    keys: { type: 'list', items: [{ type: 'atom', v: 'a', vt: 'symbol' }] },
    values: { type: 'list', items: [{ type: 'atom', v: 1, vt: 'int' }] },
  });
  assert(dictStr.includes('!'), true, 'dict contains ! separator');

  // ---- Table (flip notation) ----
  const tableStr = formatKdbInline({
    type: 'table',
    columns: [{ name: 'a' }, { name: 'b' }],
    rows: [[1, 2], [3, 4]],
    rowCount: 2,
  });
  assert(tableStr.startsWith('+`a`b!'), true, 'table starts with flip notation');

  // ---- Depth limit (MAX_DEPTH=4) ----
  let deep: any = { type: 'list', items: [1] };
  for (let i = 0; i < 10; i++) deep = { type: 'list', items: [deep] };
  assert(formatKdbInline(deep), '…', 'depth limit truncates');

  // ---- Item limit (MAX_ITEMS=30) ----
  const manyItems: any[] = [];
  for (let i = 0; i < 35; i++) manyItems.push(i);
  const longList = formatKdbInline({ type: 'list', items: manyItems });
  assert(longList.includes('…'), true, 'long list shows ellipsis');

  console.log(`kdbFormat tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
