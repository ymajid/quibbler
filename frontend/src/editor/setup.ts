import * as monaco from 'monaco-editor';
import { qLanguage, qLanguageConfig } from './qLanguage';
import { qCompletionProvider } from './completions';

// ---- Worker Setup ----
let editorWorker: Worker | null = null;
try {
  editorWorker = new Worker(
    new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
    { type: 'module' }
  );
} catch { /* fallback */ }

(self as any).MonacoEnvironment = {
  getWorker(_: string, _label: string) {
    return editorWorker ?? new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' }
    );
  },
};

// ---- Language Registration ----
monaco.languages.register({ id: 'q', extensions: ['.q', '.k'], aliases: ['Q', 'q', 'kdb'] });
monaco.languages.setMonarchTokensProvider('q', qLanguage);
monaco.languages.setLanguageConfiguration('q', qLanguageConfig);
monaco.languages.registerCompletionItemProvider('q', qCompletionProvider);

// ---- Theme ----
// Dark theme (based on vs-dark)
monaco.editor.defineTheme('mercury-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'keyword.flow', foreground: 'C586C0', fontStyle: 'bold' },
    { token: 'keyword.other', foreground: '4EC9B0' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'string.escape', foreground: 'D7BA7D' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'type.identifier', foreground: '9CDCFE' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'predefined', foreground: 'DCDCAA' },
    { token: 'operator', foreground: 'D4D4D4' },
    { token: 'delimiter', foreground: '808080' },
  ],
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#c6c6c6',
    'editor.selectionBackground': '#264f78',
    'editorCursor.foreground': '#aeafad',
    'editor.inactiveSelectionBackground': '#3a3d41',
  },
});

// Light theme (based on vs)
monaco.editor.defineTheme('mercury-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '008000', fontStyle: 'italic' },
    { token: 'keyword', foreground: '0000ff', fontStyle: 'bold' },
    { token: 'keyword.flow', foreground: 'af00db', fontStyle: 'bold' },
    { token: 'keyword.other', foreground: '008080' },
    { token: 'string', foreground: 'a31515' },
    { token: 'string.escape', foreground: 'd16969' },
    { token: 'number', foreground: '098658' },
    { token: 'type.identifier', foreground: '0451a5' },
    { token: 'type', foreground: '008080' },
    { token: 'predefined', foreground: '795e26' },
    { token: 'operator', foreground: '000000' },
    { token: 'delimiter', foreground: '808080' },
  ],
  colors: {
    'editor.background': '#faf8f5',
    'editor.foreground': '#1a1714',
    'editorLineNumber.foreground': '#b0a89c',
    'editorLineNumber.activeForeground': '#1a1714',
    'editor.selectionBackground': '#d9ccb0',
    'editorCursor.foreground': '#b8860b',
    'editor.inactiveSelectionBackground': '#ede9e3',
  },
});

export function getEditorTheme(appTheme: 'light' | 'dark'): string {
  return appTheme === 'light' ? 'mercury-light' : 'mercury-dark';
}

export interface EditorInstance {
  monacoEditor: monaco.editor.IStandaloneCodeEditor;
  dispose: () => void;
  getValue: () => string;
  setValue: (value: string) => void;
  getSelectedText: () => string;
}

export function createEditor(container: HTMLElement): EditorInstance {
  const editor = monaco.editor.create(container, {
    value: '// mercury — kdb+/q IDE\n\n',
    language: 'q',
    theme: 'mercury-dark',
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace",
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    tabSize: 2,
    insertSpaces: true,
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    automaticLayout: true,
    suggest: {
      showKeywords: true,
      showSnippets: false,
      showWords: false,
      showFiles: false,
      preview: true,
    },
    inlineSuggest: { enabled: false },
    tabCompletion: 'on',
    acceptSuggestionOnEnter: 'on',
    suggestSelection: 'first',
    glyphMargin: false,
    folding: true,
    lineDecorationsWidth: 10,
    lineNumbersMinChars: 3,
    padding: { top: 8, bottom: 8 },
  });

  editor.focus();

  return {
    monacoEditor: editor,
    dispose: () => editor.dispose(),
    getValue: () => editor.getValue(),
    setValue: (value: string) => editor.setValue(value),
    getSelectedText: () => {
      const selection = editor.getSelection();
      if (!selection) return '';
      const selected = editor.getModel()?.getValueInRange(selection);
      if (selected && selected.trim().length > 0) return selected;
      const line = editor.getModel()?.getLineContent(selection.startLineNumber);
      return line ?? '';
    },
  };
}
