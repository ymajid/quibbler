/**
 * Monarch tokenizer for the q programming language.
 *
 * Provides syntax highlighting for Monaco Editor.
 * Token categories adapted from the qvim Vim syntax file (patmok/qvim).
 *
 * Monarch docs: https://microsoft.github.io/monaco-editor/monarch.html
 */

import type { languages } from 'monaco-editor';

export const qLanguage: languages.IMonarchLanguage = {
  // Token categories used (mapped to VS Code theme scopes):
  //   keyword      — SQL-like keywords (select, exec, update, ...)
  //   keyword.flow — control flow (if, do, while, ...)
  //   type         — type names / casts
  //   type.identifier — symbols (backtick-prefixed)
  //   number       — numeric literals
  //   string       — string literals
  //   comment      — comments
  //   operator     — operators
  //   identifier   — variable names
  //   delimiter    — brackets, parens

  defaultToken: 'invalid',

  // q is case-sensitive
  ignoreCase: false,

  // Brackets
  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '[', close: ']', token: 'delimiter.square' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
  ],

  // Keywords — SQL-like
  keywords: [
    'select', 'exec', 'update', 'delete', 'insert', 'upsert',
    'by', 'from', 'where', 'fby', 'within',
    'wj', 'wj1', 'aj', 'aj0', 'asof',
    'lj', 'ij', 'uj', 'pj', 'ej',
  ],

  // Table/key modifiers
  tableModifiers: [
    'xbar', 'xcol', 'xcols', 'xdesc', 'xgroup', 'xkey', 'xlog',
    'xasc', 'xrank', 'xexp',
  ],

  // q control flow
  controlKeywords: [
    'if', 'do', 'while', 'exit',
  ],

  // q built-in functions / adverbs
  adverbs: [
    'each', 'peach', 'over', 'scan', 'prior', 'each_right', 'each_left',
    'cross', 'sv', 'vs',
  ],

  // Math / aggregation functions
  builtinFunctions: [
    'sum', 'sums', 'prd', 'prds', 'avg', 'avgs', 'count', 'distinct',
    'first', 'last', 'max', 'maxs', 'min', 'mins',
    'med', 'dev', 'var', 'cov', 'cor', 'wavg', 'wsum',
    'abs', 'asc', 'desc', 'deltas', 'differ', 'fills',
    'mavg', 'mcount', 'mdev', 'mmax', 'mmin', 'msum',
    'next', 'prev', 'rank', 'ratio', 'reverse', 'rotate',
    'iasc', 'idesc', 'inv', 'null', 'sqrt', 'exp', 'log',
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'floor', 'ceiling', 'signum', 'mod', 'div',
    'string', 'type', 'key', 'value', 'keys', 'til', 'where',
    'group', 'ungroup', 'enlist', 'flip', 'raze', 'cut',
    'not', 'and', 'or', 'all', 'any', 'except', 'inter', 'union',
    'like', 'ss', 'ssr', 'trim', 'ltrim', 'rtrim', 'upper', 'lower',
    'get', 'set', 'system', 'read0', 'read1', 'hopen', 'hclose', 'hsym',
    'parse', 'eval', 'show', 'view',
    'cols', 'tables', 'meta', 'getenv', 'setenv',
  ],

  // Datatype shortcuts
  datatypes: [
    'boolean', 'guid', 'byte', 'short', 'int', 'long',
    'real', 'float', 'char', 'string', 'symbol',
    'timestamp', 'month', 'date', 'datetime',
    'timespan', 'minute', 'second', 'time',
  ],

  tokenizer: {
    root: [
      // ---- Whitespace ----
      { include: '@whitespace' },

      // ---- System commands (start of line only) ----
      [/^\\\\([a-zA-Z_][a-zA-Z0-9_]*)/, 'keyword.other'],
      [/^\\\\([a-zA-Z_][a-zA-Z0-9_]*)\s+/, 'keyword.other'],

      // ---- Comments ----
      // Block comment: a solitary `/` line opens it; a solitary `\` line (or
      // EOF) closes it. Monarch tokenizes line-by-line, so a single regex can't
      // span lines — the block must be a stateful transition so every line in
      // it stays green instead of falling through to the `invalid` (red) token.
      [/^\/\s*$/, { token: 'comment', next: '@blockComment' }],
      // Single-line: `/` at start of line comments the rest of the line.
      [/^\/.*$/, 'comment'],

      // ---- Strings ----
      [/"/, 'string', '@string'],

      // ---- Symbols (backtick) ----
      [/`[a-zA-Z_][a-zA-Z0-9_.]*/, 'type.identifier'],

      // ---- Numbers ----
      // Hex
      [/0x[0-9a-fA-F]+/, 'number.hex'],
      // Float with exponent
      [/\d+\.?\d*[eE][+-]?\d+/, 'number.float'],
      // Float
      [/\d+\.\d*/, 'number.float'],
      // Integer with type suffix
      [/\d+[hijefcspmdznuvt]/, 'number'],
      // Just an integer
      [/\d+/, 'number'],

      // ---- Operators ----
      [/[+\-*/%&|^~<>=!@#$?:]+/, 'operator'],

      // ---- Identifiers and keywords ----
      [
        /[a-zA-Z_][a-zA-Z0-9_]*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@tableModifiers': 'keyword.other',
            '@controlKeywords': 'keyword.flow',
            '@adverbs': 'keyword',
            '@builtinFunctions': 'predefined',
            '@datatypes': 'type',
          },
        },
      ],

      // ---- Delimiters ----
      [/[{}()[\]]/, '@brackets'],
      [/[;,:]/, 'delimiter'],
      [/\\./, 'delimiter'], // dot operator for namespaces
    ],

    // Multiline block comment: every line stays green until a solitary `\`
    // (or end of file, which q also treats as the terminator).
    blockComment: [
      [/^\\\s*$/, { token: 'comment', next: '@pop' }],
      [/.*$/, 'comment'],
    ],

    // Inside double-quoted strings
    string: [
      [/\\"/, 'string.escape'],   // escaped quote
      [/\\[\\nrt]/, 'string.escape'], // other escapes
      [/"/, 'string', '@pop'],
      [/[^"\\]+/, 'string'],
    ],

    whitespace: [
      [/\s+/, 'white'],
    ],
  },
};

// Monaco language registration config
export const qLanguageConfig: languages.LanguageConfiguration = {
  comments: {
    lineComment: '/',
    blockComment: ['/', '\\'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  // q identifiers: letters/digits/underscore with optional namespace dots
  wordPattern: /[a-zA-Z_][a-zA-Z0-9_.]*/,
};
