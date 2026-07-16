import { useEffect, useRef } from 'preact/hooks';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { createEditor, getEditorTheme, detectLanguage } from '../editor/setup';
import { setEditorRef } from './Toolbar';
import {
  activeConnectionId, queryResult, queryError, queryRunning, queryId,
  addConsoleMessage, resultPanelTab, lastTiming, theme, pushResultSnapshot,
  editorTabs, activeEditorTabPath, activeEditorTab,
  newTab, openFileTab, closeTab, updateTabContent, saveTabContent, renameTab,
  saveDialogVisible, saveDialogContent, saveDialogDefaultName, openDialogVisible,
  confirmClosePath, workspaceNeedsRefresh, triggerWorkspaceRefresh, cursorInfo, alignDialog, editorLanguage,
} from '../store';
import * as bridge from '../bridge';
import { SaveDialog } from './SaveDialog';
import type { EditorInstance } from '../editor/setup';
import { formatKdbInline } from '../renderers/kdbFormat';
import { setWorkspaceContext } from '../editor/completions';

/**
 * Align each line on the first occurrence of `delim`, padding the part before it
 * so the delimiter lands in the same column (align.nvim style). Lines without the
 * delimiter are left untouched.
 */
function alignLines(lines: string[], delim: string, padAfter: number): string[] {
  const parsed = lines.map(line => {
    const i = line.indexOf(delim);
    if (i < 0) return null;
    return { left: line.slice(0, i).replace(/\s+$/, ''), right: line.slice(i + delim.length).replace(/^\s+/, '') };
  });
  const maxLeft = parsed.reduce((m, p) => (p ? Math.max(m, p.left.length) : m), 0);
  return lines.map((line, idx) => {
    const p = parsed[idx];
    if (!p) return line;
    return p.left.padEnd(maxLeft) + delim + ' '.repeat(padAfter) + p.right;
  });
}

/**
 * Format a query result as kdb+ REPL console output.
 */
function formatConsoleResult(result: bridge.QueryResult): string {
  if (result.type === 'error') return "'" + (result.message as string);
  if (result.type === 'atom') {
    const v = result.v;
    if (v === null || v === undefined) return '::';
    const vt = result.vt as string;
    if (vt === 'boolean') return v ? '1b' : '0b';
    if (vt === 'symbol') return '`' + String(v);
    if (vt === 'char') return '"' + String(v) + '"';
    if (vt === 'string') return '"' + String(v) + '"';
    return String(v);
  }
  if (result.type === 'table') {
    const cols = (result.columns as Array<{ name: string }>) ?? [];
    const rowCount = (result.rowCount as number) ?? 0;
    const rows = (result.rows as unknown[][]) ?? [];
    let out = '';
    for (const col of cols) out += col.name + ' ';
    out += '\n' + '─'.repeat(Math.min(out.length, 80)) + '\n';
    const showRows = Math.min(rowCount, 5);
    for (let r = 0; r < showRows; r++) {
      const row = rows[r] ?? [];
      out += row.map(v => formatKdbInline(v)).join(' ') + '\n';
    }
    if (rowCount > 5) out += '…\n';
    return out;
  }
  if (result.type === 'dict') return formatKdbInline(result);
  if (result.type === 'list') return formatKdbInline(result);
  return formatKdbInline(result);
}

export function EditorPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const currentTabPath = useRef<string | null>(null);
  const execSeq = useRef(0);  // guards against an older query overwriting a newer one
  const manualLang = useRef<Record<string, string>>({});  // per-tab manual language override

  // Set the editor language for a tab: a manual override wins, else detect from
  // the filename / shebang. Keeps the status-bar language indicator in sync.
  const applyLang = (mEditor: monaco.editor.IStandaloneCodeEditor, path: string, name: string, content: string) => {
    const model = mEditor.getModel();
    if (!model) return;
    const lang = manualLang.current[path] || detectLanguage(name, content);
    if (model.getLanguageId() !== lang) monaco.editor.setModelLanguage(model, lang);
    editorLanguage.value = lang;
  };

  // Close-tab helper — at component level so JSX can access it
  const tryCloseTab = (filePath: string) => {
    const tab = editorTabs.value.find(t => t.path === filePath);
    if (tab?.dirty) {
      confirmClosePath.value = filePath;
    } else {
      closeTab(filePath);
    }
  };

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;
    const editor = createEditor(containerRef.current);
    editorRef.current = editor;
    setEditorRef(editor);

    // Load initial tab content
    const tab = activeEditorTab.value;
    if (tab) {
      editor.setValue(tab.content);
      applyLang(editor.monacoEditor, tab.path, tab.name, tab.content);
      currentTabPath.value = tab.path;
      if (!tab.content.trim()) editor.monacoEditor.focus();
    }

    // Track cursor position + current-line length for the status bar
    const updateCursor = () => {
      const ed = editor.monacoEditor;
      const pos = ed.getPosition();
      const model = ed.getModel();
      if (pos && model) {
        cursorInfo.value = { line: pos.lineNumber, col: pos.column, lineChars: model.getLineLength(pos.lineNumber) };
      }
    };
    editor.monacoEditor.onDidChangeCursorPosition(updateCursor);
    updateCursor();

    // Track content changes → mark tab dirty, or auto-create tab
    editor.monacoEditor.onDidChangeModelContent(() => {
      const p = currentTabPath.value;
      if (p) {
        updateTabContent(p, editor.getValue());
      } else if (editor.getValue().trim()) {
        // User started typing with no tabs open — create one
        const tab = newTab();
        currentTabPath.value = tab.path;
        updateTabContent(tab.path, editor.getValue());
      }
      // Re-detect language (e.g. a shebang typed into a scratch tab); a manual
      // override still wins. setModelLanguage only fires when it actually changes.
      const t = activeEditorTab.value;
      applyLang(editor.monacoEditor, currentTabPath.value ?? '', t?.name ?? '', editor.getValue());
    });

    // Execute query (async — UI stays responsive for cancellation)
    const handleExecute = async () => {
      let text = editor.getSelectedText();
      // Fall back to current line if nothing is selected
      if (!text.trim()) {
        const model = editor.monacoEditor.getModel();
        if (model) {
          const pos = editor.monacoEditor.getPosition();
          if (pos) {
            text = model.getLineContent(pos.lineNumber).trim();
          }
        }
      }
      if (!text.trim()) return;

      const connId = activeConnectionId.value;
      if (!connId) {
        addConsoleMessage('No connection selected', 'error');
        return;
      }

      const seq = ++execSeq.current;
      queryRunning.value = true;
      addConsoleMessage('q)' + text, 'info');
      const t0 = performance.now();
      try {
        const result = await bridge.queryAsync(connId, text);
        if (seq !== execSeq.current) return;  // a newer query superseded this one
        if (!result) return; // cancelled
        const queryDoneMs = Math.round(performance.now() - t0);
        const serverMs = (result as any)._serverMs ?? 0;
        const networkMs = queryDoneMs - serverMs;
        const rowCount = result.type === 'table' ? (result.rowCount as number) ?? 0
          : result.type === 'list' ? (result.length as number) ?? (result.items as any[])?.length ?? 0
          : result.type === 'dict' ? 1 : 1;
        queryResult.value = result;
        queryError.value = null;
        queryId.value++;
        resultPanelTab.value = 'result';
        addConsoleMessage(formatConsoleResult(result), 'result');
        // Measure render time: time from setting result to next frame
        const renderT0 = performance.now();
        requestAnimationFrame(() => {
          const renderMs = Math.round(performance.now() - renderT0);
          const timing = { totalMs: queryDoneMs + renderMs, serverMs, networkMs, renderMs, rowCount };
          lastTiming.value = timing;
          pushResultSnapshot(result, text, timing);   // record for result-history navigation
        });
        // Trigger debounced workspace refresh
        triggerWorkspaceRefresh();
      } catch (e: any) {
        if (seq !== execSeq.current) return;  // superseded — don't surface a stale error
        const msg = e.message || String(e);
        if (msg === 'Cancelled') {
          addConsoleMessage('Query cancelled', 'info');
        } else {
          queryError.value = msg;
          addConsoleMessage("'" + msg, 'error');
        }
      } finally {
        if (seq === execSeq.current) queryRunning.value = false;
      }
    };

    editor.monacoEditor.addAction({
      id: 'quibbler-execute',
      label: 'Execute Query',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE,
      ],
      run: () => { handleExecute(); },
    });

    editor.monacoEditor.addAction({
      id: 'quibbler-save',
      label: 'Save File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => { handleSave(); },
    });

    editor.monacoEditor.addAction({
      id: 'quibbler-new-tab',
      label: 'New Tab',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN],
      run: () => { handleNewTab(); },
    });

    editor.monacoEditor.addAction({
      id: 'quibbler-open-file',
      label: 'Open File…',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO],
      run: () => { openDialogVisible.value = true; },
    });

    editor.monacoEditor.addAction({
      id: 'quibbler-close-tab',
      label: 'Close Tab',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW],
      run: () => {
        const p = currentTabPath.value;
        if (p) tryCloseTab(p);
      },
    });

    editor.monacoEditor.addAction({
      id: 'quibbler-wordwrap',
      label: 'Toggle Word Wrap',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL],
      run: () => {
        const opts = editor.monacoEditor.getRawOptions();
        editor.monacoEditor.updateOptions({ wordWrap: opts.wordWrap === 'off' ? 'on' : 'off' });
      },
    });

    editor.monacoEditor.addAction({
      id: 'quibbler-palette',
      label: 'Switch Connection',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP],
      run: () => { window.dispatchEvent(new CustomEvent('quibbler:palette')); },
    });

    editor.monacoEditor.addAction({
      id: 'quibbler-align',
      label: 'Align on delimiter…',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyA],
      contextMenuGroupId: 'modification',
      contextMenuOrder: 1.5,
      run: (ed) => {
        const sel = ed.getSelection();
        if (sel) alignDialog.value = { startLine: sel.startLineNumber, endLine: sel.endLineNumber };
      },
    });

    const handleInsertText = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (text && editorRef.current) {
        const ed = editorRef.current.monacoEditor;
        const sel = ed.getSelection();
        if (sel) ed.executeEdits('insert', [{
          range: { startLineNumber: sel.startLineNumber, startColumn: sel.startColumn,
                   endLineNumber: sel.endLineNumber, endColumn: sel.endColumn },
          text,
        }]);
        ed.focus();
      }
    };

    // Handle setQuery from history panel — append at end of file on a new line
    const handleSetQuery = (e: Event) => {
      const query = (e as CustomEvent).detail?.query;
      if (query && editorRef.current) {
        if (!currentTabPath.value) {
          const tab = newTab();
          currentTabPath.value = tab.path;
        }
        const ed = editorRef.current.monacoEditor;
        const model = ed.getModel();
        if (model) {
          const lastLine = model.getLineCount();
          const lastCol = model.getLineMaxColumn(lastLine);
          const needsNewline = model.getValueInRange({
            startLineNumber: lastLine, startColumn: 1,
            endLineNumber: lastLine, endColumn: lastCol,
          }).trim() !== '';
          const insertText = (needsNewline ? '\n' : '') + query;
          ed.executeEdits('history', [{
            range: {
              startLineNumber: lastLine,
              startColumn: lastCol,
              endLineNumber: lastLine,
              endColumn: lastCol,
            },
            text: insertText,
          }]);
          ed.revealLine(lastLine + (needsNewline ? 1 : 0));
        }
        ed.focus();
      }
    };

    // Align selected lines on a delimiter (triggered by AlignDialog)
    const handleApplyAlign = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const ed = editorRef.current?.monacoEditor;
      const model = ed?.getModel();
      if (!ed || !model || !d?.delim) return;
      const start = Math.max(1, d.startLine);
      const end = Math.min(model.getLineCount(), d.endLine);
      const lines: string[] = [];
      for (let ln = start; ln <= end; ln++) lines.push(model.getLineContent(ln));
      const aligned = alignLines(lines, d.delim, d.padAfter ?? 1);
      ed.executeEdits('align', [{
        range: { startLineNumber: start, startColumn: 1, endLineNumber: end, endColumn: model.getLineMaxColumn(end) },
        text: aligned.join('\n'),
      }]);
      ed.focus();
    };

    // Manual language switch from the status-bar picker — sticks for that tab.
    const handleSetLanguage = (e: Event) => {
      const lang = (e as CustomEvent).detail?.lang;
      if (!lang) return;
      const path = currentTabPath.value;
      if (path) manualLang.current[path] = lang;
      const model = editorRef.current?.monacoEditor.getModel();
      if (model && model.getLanguageId() !== lang) monaco.editor.setModelLanguage(model, lang);
      editorLanguage.value = lang;
    };

    window.addEventListener('quibbler:execute', handleExecute);
    window.addEventListener('quibbler:insertText', handleInsertText);
    window.addEventListener('quibbler:setQuery', handleSetQuery);
    window.addEventListener('quibbler:applyAlign', handleApplyAlign);
    window.addEventListener('quibbler:setLanguage', handleSetLanguage);
    return () => {
      window.removeEventListener('quibbler:execute', handleExecute);
      window.removeEventListener('quibbler:insertText', handleInsertText);
      window.removeEventListener('quibbler:setQuery', handleSetQuery);
      window.removeEventListener('quibbler:applyAlign', handleApplyAlign);
      window.removeEventListener('quibbler:setLanguage', handleSetLanguage);
      editor.dispose();
    };
  }, []);

  // Switch tabs: save current, load new. If no tabs, clear editor.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;

    const activePath = activeEditorTabPath.value;

    // No tabs left — clear editor
    if (!activePath) {
      if (currentTabPath.value) {
        updateTabContent(currentTabPath.value, ed.getValue());
      }
      currentTabPath.value = null;
      ed.setValue('');
      return;
    }

    // Already on this tab?
    if (currentTabPath.value === activePath) return;

    // Save current tab content before switching
    if (currentTabPath.value) {
      updateTabContent(currentTabPath.value, ed.getValue());
    }

    // Load new tab — update currentTabPath FIRST so the content-change
    // handler attributes edits to the correct tab.
    const tab = editorTabs.value.find(t => t.path === activePath);
    if (tab) {
      currentTabPath.value = activePath;
      ed.setValue(tab.content);
      applyLang(ed.monacoEditor, tab.path, tab.name, tab.content);
      ed.monacoEditor.focus();
    }
  }, [activeEditorTabPath.value]);

  const handleSave = () => {
    const tab = activeEditorTab.value;
    if (!tab || !editorRef.current) return;
    const content = editorRef.current.getValue();

    if (tab.path.startsWith('untitled:')) {
      // Save As — show dialog
      saveDialogDefaultName.value = tab.name;
      saveDialogContent.value = content;
      saveDialogVisible.value = true;
    } else {
      // Save to existing path
      try {
        bridge.saveFile(tab.path, content);
        saveTabContent(tab.path, content);
        addConsoleMessage('Saved: ' + tab.path);
      } catch (e: any) {
        addConsoleMessage('Save failed: ' + e.message, 'error');
      }
    }
  };

  // Refresh workspace context for autocomplete
  const refreshWorkspace = () => {
    const connId = activeConnectionId.value;
    if (!connId) {
      setWorkspaceContext(null);
      return;
    }
    // Async so autocomplete context refresh doesn't block the editor.
    bridge.getWorkspaceAsync(connId)
      .then(ctx => { if (activeConnectionId.value === connId && ctx && ctx.tables) setWorkspaceContext(ctx); })
      .catch(() => { if (activeConnectionId.value === connId) setWorkspaceContext(null); });
  };

  // Refresh on connection change
  useEffect(() => {
    refreshWorkspace();
  }, [activeConnectionId.value]);

  // Switch Monaco editor theme when app theme changes
  useEffect(() => {
    const ed = editorRef.current;
    if (ed) {
      monaco.editor.setTheme(getEditorTheme(theme.value));
    }
  }, [theme.value]);

  // Debounced workspace refresh — waits 3s after last query before refreshing
  useEffect(() => {
    if (workspaceNeedsRefresh.value === 0) return;
    const timer = setTimeout(() => {
      refreshWorkspace();
    }, 3000);
    return () => clearTimeout(timer);
  }, [workspaceNeedsRefresh.value]);

  const handleNewTab = () => {
    newTab();
  };

  const handleOpenFile = (filePath: string, fileName: string) => {
    try {
      const content = bridge.readFile(filePath);
      openFileTab(filePath, fileName, content);
    } catch (e: any) {
      addConsoleMessage('Failed to open: ' + e.message, 'error');
    }
  };

  // Expose openFile for the file browser
  useEffect(() => {
    (window as any).__quibblerOpenFile = handleOpenFile;
    return () => { delete (window as any).__quibblerOpenFile; };
  }, []);

  const tab = activeEditorTab.value;
  const tabs = editorTabs.value;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', height: '28px', background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)', flexShrink: 0, alignItems: 'stretch',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', overflowX: 'auto', overflowY: 'hidden',
          flex: 1, scrollBehavior: 'smooth',
        }}>
          {tabs.map(t => {
            const isActive = t.path === activeEditorTabPath.value;
            return (
              <div key={t.path}
                onClick={() => { activeEditorTabPath.value = t.path; }}
                onMouseDown={e => e.button === 1 && tryCloseTab(t.path)}
                title={t.path.startsWith('untitled:') ? t.name : t.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '2px 10px', fontSize: '12px', cursor: 'pointer',
                  background: isActive ? 'var(--bg)' : 'var(--bg-panel)',
                  color: isActive ? 'var(--text-bright)' : 'var(--text-secondary)',
                  borderRight: '1px solid #252526',
                  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  whiteSpace: 'nowrap', userSelect: 'none', minWidth: 0,
                }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.name}
                </span>
                {t.dirty && <span style={{ color: 'var(--status-warn)', fontSize: '9px', lineHeight: 1 }}>●</span>}
                <span onClick={e => { e.stopPropagation(); tryCloseTab(t.path); }}
                  style={{
                    color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1, padding: '0 2px',
                    borderRadius: '3px', marginLeft: '2px',
                  }}
                  onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--border-subtle)'}
                  onMouseLeave={e => (e.target as HTMLElement).style.background = 'transparent'}>
                  ×
                </span>
              </div>
            );
          })}
        </div>
        <button onClick={handleNewTab}
          title="New Tab (Ctrl+N)"
          style={{
            background: 'transparent', color: 'var(--text-bright)', border: 'none',
            cursor: 'pointer', padding: '2px 10px', fontSize: '16px',
            borderLeft: '1px solid var(--border)', flexShrink: 0,
          }}>
          +
        </button>
      </div>

      {/* Editor */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />

      {/* Save-As dialog */}
      <SaveDialog
        visible={saveDialogVisible.value}
        content={saveDialogContent.value}
        defaultName={saveDialogDefaultName.value}
        onSave={(path) => {
          const ed = editorRef.current;
          if (!ed) return;
          const content = ed.getValue();
          try {
            bridge.saveFile(path, content);
            const name = path.split('/').pop() || path;
            const oldPath = activeEditorTabPath.value;
            if (oldPath) {
              renameTab(oldPath, path, name);
              saveTabContent(path, content);
            }
            addConsoleMessage('Saved: ' + path);
            saveDialogVisible.value = false;
          } catch (e: any) {
            addConsoleMessage('Save failed: ' + e.message, 'error');
          }
        }}
        onCancel={() => { saveDialogVisible.value = false; }}
      />
    </div>
  );
}
