/**
 * Monaco completion provider for the q language.
 *
 * Combines static completions (keywords, built-ins, system commands)
 * with dynamic workspace context (tables, columns, functions, variables)
 * fetched from the connected kdb+ process.
 */

import * as monaco from 'monaco-editor';
import type { languages } from 'monaco-editor';

// ---- kdb workspace context (populated from backend) ----

export interface WorkspaceContext {
  tables: Record<string, Array<{ name: string; type: string }>>;   // tableName → column info
  functions: string[];
  variables: string[];
}

let workspaceCache: WorkspaceContext | null = null;

export function setWorkspaceContext(ctx: WorkspaceContext | null) {
  workspaceCache = ctx;
}

export function getWorkspaceContext(): WorkspaceContext | null {
  return workspaceCache;
}

// ---- static completions ----

interface CompletionDef {
  label: string;
  insertText?: string;
  detail?: string;
  kind: languages.CompletionItemKind;
}

const SQL_LIKE: CompletionDef[] = [
  { label: 'select', detail: 'select columns from table', kind: 14 },  // Keyword
  { label: 'exec', detail: 'exec columns from table', kind: 14 },
  { label: 'update', detail: 'update table set cols', kind: 14 },
  { label: 'delete', detail: 'delete rows from table', kind: 14 },
  { label: 'insert', detail: 'insert into table', kind: 14 },
  { label: 'upsert', detail: 'upsert into table', kind: 14 },
  { label: 'from', detail: 'from table or subquery', kind: 14 },
  { label: 'where', detail: 'filter clause', kind: 14 },
  { label: 'by', detail: 'group by', kind: 14 },
  { label: 'fby', detail: 'filter by', kind: 14 },
  { label: 'within', detail: 'within bounds', kind: 14 },
  { label: 'wj', detail: 'window join', kind: 8 },  // Function
  { label: 'wj1', detail: 'window join (v1)', kind: 8 },
  { label: 'aj', detail: 'asof join', kind: 8 },
  { label: 'aj0', detail: 'asof join (v0)', kind: 8 },
  { label: 'asof', detail: 'asof', kind: 14 },
  { label: 'lj', detail: 'left join', kind: 8 },
  { label: 'ij', detail: 'inner join', kind: 8 },
  { label: 'uj', detail: 'union join', kind: 8 },
  { label: 'pj', detail: 'plus join', kind: 8 },
  { label: 'ej', detail: 'equi join', kind: 8 },
];

const CONTROL_FLOW: CompletionDef[] = [
  { label: 'if', detail: 'conditional', kind: 14 },
  { label: 'do', detail: 'iteration', kind: 14 },
  { label: 'while', detail: 'while loop', kind: 14 },
  { label: 'exit', detail: 'exit process', kind: 14 },
];

const TABLE_MODIFIERS: CompletionDef[] = [
  { label: 'xbar', detail: 'interval bar', kind: 8 },
  { label: 'xcol', detail: 'rename cols', kind: 8 },
  { label: 'xcols', detail: 'reorder cols', kind: 8 },
  { label: 'xdesc', detail: 'sort descending', kind: 8 },
  { label: 'xgroup', detail: 'group by', kind: 8 },
  { label: 'xkey', detail: 'set keys', kind: 8 },
  { label: 'xlog', detail: 'log', kind: 8 },
  { label: 'xasc', detail: 'sort ascending', kind: 8 },
  { label: 'xrank', detail: 'rank', kind: 8 },
  { label: 'xexp', detail: 'export', kind: 8 },
];

const ADVERBS: CompletionDef[] = [
  { label: 'each', detail: 'map', kind: 8 },
  { label: "each'", insertText: "each'", detail: 'each concurrent', kind: 8 },
  { label: 'peach', detail: 'parallel each', kind: 8 },
  { label: 'over', detail: 'reduce/iterate', kind: 8 },
  { label: 'scan', detail: 'scan/accumulate', kind: 8 },
  { label: 'prior', detail: 'apply between pairs', kind: 8 },
  { label: "each_right", insertText: 'each_right', detail: 'each right', kind: 8 },
  { label: "each_left", insertText: 'each_left', detail: 'each left', kind: 8 },
  { label: 'cross', detail: 'cross product', kind: 8 },
  { label: 'sv', detail: 'scalar from vector', kind: 8 },
  { label: 'vs', detail: 'vector from scalar', kind: 8 },
];

const AGGREGATIONS: CompletionDef[] = [
  { label: 'sum', detail: 'sum', kind: 8 },
  { label: 'sums', detail: 'cumulative sums', kind: 8 },
  { label: 'prd', detail: 'product', kind: 8 },
  { label: 'prds', detail: 'cumulative products', kind: 8 },
  { label: 'avg', detail: 'average (mean)', kind: 8 },
  { label: 'avgs', detail: 'cumulative averages', kind: 8 },
  { label: 'count', detail: 'count items', kind: 8 },
  { label: 'distinct', detail: 'unique items', kind: 8 },
  { label: 'first', detail: 'first item', kind: 8 },
  { label: 'last', detail: 'last item', kind: 8 },
  { label: 'max', detail: 'maximum', kind: 8 },
  { label: 'maxs', detail: 'cumulative maximums', kind: 8 },
  { label: 'min', detail: 'minimum', kind: 8 },
  { label: 'mins', detail: 'cumulative minimums', kind: 8 },
  { label: 'med', detail: 'median', kind: 8 },
  { label: 'dev', detail: 'standard deviation', kind: 8 },
  { label: 'var', detail: 'variance', kind: 8 },
  { label: 'cov', detail: 'covariance', kind: 8 },
  { label: 'cor', detail: 'correlation', kind: 8 },
  { label: 'wavg', detail: 'weighted average', kind: 8 },
  { label: 'wsum', detail: 'weighted sum', kind: 8 },
];

const MATH: CompletionDef[] = [
  { label: 'abs', detail: 'absolute', kind: 8 },
  { label: 'asc', detail: 'sort ascending', kind: 8 },
  { label: 'desc', detail: 'sort descending', kind: 8 },
  { label: 'deltas', detail: 'differences', kind: 8 },
  { label: 'differ', detail: 'differ', kind: 8 },
  { label: 'fills', detail: 'forward-fill nulls', kind: 8 },
  { label: 'mavg', detail: 'moving average', kind: 8 },
  { label: 'mcount', detail: 'moving count', kind: 8 },
  { label: 'mdev', detail: 'moving deviation', kind: 8 },
  { label: 'mmax', detail: 'moving maximum', kind: 8 },
  { label: 'mmin', detail: 'moving minimum', kind: 8 },
  { label: 'msum', detail: 'moving sum', kind: 8 },
  { label: 'next', detail: 'next item', kind: 8 },
  { label: 'prev', detail: 'previous item', kind: 8 },
  { label: 'rank', detail: 'rank', kind: 8 },
  { label: 'ratio', detail: 'ratio', kind: 8 },
  { label: 'reverse', detail: 'reverse', kind: 8 },
  { label: 'rotate', detail: 'rotate', kind: 8 },
  { label: 'iasc', detail: 'index asc', kind: 8 },
  { label: 'idesc', detail: 'index desc', kind: 8 },
  { label: 'inv', detail: 'matrix inverse', kind: 8 },
  { label: 'null', detail: 'is null?', kind: 8 },
  { label: 'sqrt', detail: 'square root', kind: 8 },
  { label: 'exp', detail: 'exponent', kind: 8 },
  { label: 'log', detail: 'natural log', kind: 8 },
  { label: 'sin', detail: 'sin', kind: 8 },
  { label: 'cos', detail: 'cos', kind: 8 },
  { label: 'tan', detail: 'tan', kind: 8 },
  { label: 'asin', detail: 'arcsin', kind: 8 },
  { label: 'acos', detail: 'arccos', kind: 8 },
  { label: 'atan', detail: 'arctan', kind: 8 },
  { label: 'floor', detail: 'floor', kind: 8 },
  { label: 'ceiling', detail: 'ceiling', kind: 8 },
  { label: 'signum', detail: 'sign', kind: 8 },
  { label: 'mod', detail: 'modulus', kind: 8 },
  { label: 'div', detail: 'integer divide', kind: 8 },
];

const LIST_OPS: CompletionDef[] = [
  { label: 'til', detail: 'integers 0..n-1', kind: 8 },
  { label: 'where', detail: 'where true / expand', kind: 8 },
  { label: 'group', detail: 'group by value', kind: 8 },
  { label: 'ungroup', detail: 'ungroup', kind: 8 },
  { label: 'enlist', detail: 'make singleton list', kind: 8 },
  { label: 'flip', detail: 'transpose / table', kind: 8 },
  { label: 'raze', detail: 'flatten', kind: 8 },
  { label: 'cut', detail: 'cut list', kind: 8 },
  { label: 'except', detail: 'set difference', kind: 8 },
  { label: 'inter', detail: 'set intersection', kind: 8 },
  { label: 'union', detail: 'set union', kind: 8 },
  { label: 'in', detail: 'membership', kind: 8 },
  { label: 'like', detail: 'pattern match', kind: 8 },
  { label: 'ss', detail: 'string search', kind: 8 },
  { label: 'ssr', detail: 'string search-replace', kind: 8 },
];

const STRING_OPS: CompletionDef[] = [
  { label: 'trim', detail: 'trim whitespace', kind: 8 },
  { label: 'ltrim', detail: 'left trim', kind: 8 },
  { label: 'rtrim', detail: 'right trim', kind: 8 },
  { label: 'upper', detail: 'uppercase', kind: 8 },
  { label: 'lower', detail: 'lowercase', kind: 8 },
  { label: 'sv', detail: 'scalar→vector', kind: 8 },
  { label: 'vs', detail: 'vector→scalar', kind: 8 },
];

const META: CompletionDef[] = [
  { label: 'type', detail: 'data type', kind: 8 },
  { label: 'key', detail: 'keys of dict/table', kind: 8 },
  { label: 'value', detail: 'values', kind: 8 },
  { label: 'keys', detail: 'key names', kind: 8 },
  { label: 'cols', detail: 'column names', kind: 8 },
  { label: 'tables', detail: 'table list', kind: 8 },
  { label: 'meta', detail: 'table metadata', kind: 8 },
  { label: 'get', detail: 'read file/var', kind: 8 },
  { label: 'set', detail: 'write file/var', kind: 8 },
  { label: 'system', detail: 'system command', kind: 8 },
  { label: 'read0', detail: 'read file lines', kind: 8 },
  { label: 'read1', detail: 'read file bytes', kind: 8 },
  { label: 'hopen', detail: 'open handle', kind: 8 },
  { label: 'hclose', detail: 'close handle', kind: 8 },
  { label: 'hsym', detail: 'handle symbol', kind: 8 },
  { label: 'parse', detail: 'parse expression', kind: 8 },
  { label: 'eval', detail: 'evaluate', kind: 8 },
  { label: 'show', detail: 'display to console', kind: 8 },
  { label: 'view', detail: 'view', kind: 8 },
  { label: 'getenv', detail: 'get env var', kind: 8 },
  { label: 'setenv', detail: 'set env var', kind: 8 },
  { label: 'string', detail: 'convert to string', kind: 8 },
];

const DATATYPES: CompletionDef[] = [
  { label: 'boolean', detail: '1b / 0b', kind: 21 },  // Type
  { label: 'guid', detail: 'GUID', kind: 21 },
  { label: 'byte', detail: '0x00', kind: 21 },
  { label: 'short', detail: 'short int', kind: 21 },
  { label: 'int', detail: 'integer', kind: 21 },
  { label: 'long', detail: 'long integer', kind: 21 },
  { label: 'real', detail: 'single float', kind: 21 },
  { label: 'float', detail: 'double float', kind: 21 },
  { label: 'char', detail: 'character', kind: 21 },
  { label: 'symbol', detail: 'symbol', kind: 21 },
  { label: 'timestamp', detail: 'timestamp', kind: 21 },
  { label: 'month', detail: 'month', kind: 21 },
  { label: 'date', detail: 'date', kind: 21 },
  { label: 'datetime', detail: 'datetime', kind: 21 },
  { label: 'timespan', detail: 'timespan', kind: 21 },
  { label: 'minute', detail: 'minute', kind: 21 },
  { label: 'second', detail: 'second', kind: 21 },
  { label: 'time', detail: 'time', kind: 21 },
];

const SYSTEM: CompletionDef[] = [
  { label: '\\l', insertText: '\\\\l ', detail: 'load script', kind: 0 },  // Method
  { label: '\\cd', insertText: '\\\\cd ', detail: 'change directory', kind: 0 },
  { label: '\\p', insertText: '\\\\p ', detail: 'set port', kind: 0 },
  { label: '\\t', insertText: '\\\\t ', detail: 'timer', kind: 0 },
  { label: '\\a', insertText: '\\\\a', detail: 'list tables', kind: 0 },
  { label: '\\f', insertText: '\\\\f', detail: 'list functions', kind: 0 },
  { label: '\\v', insertText: '\\\\v', detail: 'list variables', kind: 0 },
  { label: '\\d', insertText: '\\\\d ', detail: 'set namespace', kind: 0 },
  { label: '\\c', insertText: '\\\\c ', detail: 'console size', kind: 0 },
  { label: '\\w', insertText: '\\\\w', detail: 'workspace stats', kind: 0 },
  { label: '\\ts', insertText: '\\\\ts ', detail: 'time+space', kind: 0 },
  { label: '\\sv', insertText: '\\\\sv ', detail: 'set variable', kind: 0 },
];

const ALL_STATIC: CompletionDef[] = [
  ...SQL_LIKE, ...CONTROL_FLOW, ...TABLE_MODIFIERS, ...ADVERBS,
  ...AGGREGATIONS, ...MATH, ...LIST_OPS, ...STRING_OPS, ...META,
  ...DATATYPES, ...SYSTEM,
];

// ---- Monaco completion provider ----

function makeRange(model: monaco.editor.ITextModel, position: monaco.Position): monaco.IRange {
  const word = model.getWordUntilPosition(position);
  // If cursor is in the middle of a word, replace the whole word
  if (word.startColumn < word.endColumn) {
    return {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };
  }
  // Cursor is at a word boundary or after space — insert at cursor
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: position.column,
    endColumn: position.column,
  };
}

function makeSuggestion(
  label: string,
  kind: languages.CompletionItemKind,
  detail: string,
  range: monaco.IRange,
  sort: string,
  insertText?: string,
): languages.CompletionItem {
  return {
    label,
    kind,
    detail,
    insertText: insertText ?? label,
    range,
    sortText: sort + label,
  };
}

export const qCompletionProvider: languages.CompletionItemProvider = {
  triggerCharacters: ['.', '`'],

  provideCompletionItems(model, position) {
    const range = makeRange(model, position);
    const textUntilPos = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    });

    const suggestions: languages.CompletionItem[] = [];

    // ---- Static word completions ----
    for (const def of ALL_STATIC) {
      suggestions.push(makeSuggestion(
        def.label,
        def.kind as languages.CompletionItemKind,
        def.detail ?? '',
        range,
        '0',
        def.insertText,
      ));
    }

    // ---- Dynamic: table names + columns from workspace ----
    const ctx = workspaceCache;
    if (ctx) {
      // Table names
      for (const tableName of Object.keys(ctx.tables)) {
        suggestions.push(makeSuggestion(tableName, 5, 'table', range, '1'));
      }

      // Column completions after "tableName."
      const dotMatch = textUntilPos.match(/([a-zA-Z_][a-zA-Z0-9_]*)\.\s*$/);
      if (dotMatch) {
        const tableName = dotMatch[1];
        const cols = ctx.tables[tableName];
        if (cols) {
          for (const col of cols) {
            const colName = typeof col === 'string' ? col : col.name;
            suggestions.push(makeSuggestion(colName, 10, tableName + '.' + colName, range, '2'));
          }
        }
      }

      // Functions
      for (const fn of ctx.functions) {
        suggestions.push(makeSuggestion(fn, 8, 'function', range, '1'));
      }

      // Variables
      for (const v of ctx.variables) {
        suggestions.push(makeSuggestion(v, 13, 'variable', range, '1'));
      }
    }

    return { suggestions };
  },
};
