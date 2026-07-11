/**
 * Root application component.
 *
 * Sets up the VS Code-like layout with resizable panels using split.js:
 *   - Toolbar (top)
 *   - Horizontal split: Sidebar | Main area
 *   - Within main area, vertical split: Editor | Results
 */

import { useEffect, useRef } from 'preact/hooks';
import { useSignalEffect } from '@preact/signals';
import Split from 'split.js';
import {
  sidebarVisible, theme, setConnections, refreshConnectionStatuses,
  sidebarTab, resultPanelTab, activeConnectionId, editorTabs, activeEditorTabPath,
  layoutSizes, persistSession,
} from '../store';
import * as bridge from '../bridge';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
import { EditorPanel } from './EditorPanel';
import { ResultPanel } from './ResultPanel';
import { StatusBar } from './StatusBar';
import { ConnectionPalette } from './ConnectionPalette';
import { ConfirmCloseDialog } from './ConfirmCloseDialog';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { PoppedCharts } from './PoppedCharts';
import { AlignDialog } from './AlignDialog';
import { ErrorBoundary } from './ErrorBoundary';

export function App() {
  const horizontalRef = useRef<HTMLDivElement>(null);
  const verticalRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const resultAreaRef = useRef<HTMLDivElement>(null);

  const horizontalSplit = useRef<Split.Instance | null>(null);
  const verticalSplit = useRef<Split.Instance | null>(null);

  // Load saved connections on startup and probe them in the background
  useEffect(() => {
    try {
      const list = bridge.getConnections();
      setConnections(list);
      // Non-blocking probe — dead hosts (2s timeout each) never freeze the UI.
      refreshConnectionStatuses(list);
    } catch { /* bridge not available yet */ }
  }, []);

  // Apply theme to <html> and persist
  useSignalEffect(() => {
    const t = theme.value;
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('mercury-theme', t); } catch {}
  });

  // Persist the full session whenever any captured piece of state changes,
  // so the workspace reopens exactly as it closed.
  // Debounced: editorTabs changes on every keystroke, so writing the whole
  // session to localStorage synchronously each time would make typing janky in
  // large files. Coalesce to 400ms after the last change; beforeunload flushes.
  useSignalEffect(() => {
    void editorTabs.value;
    void activeEditorTabPath.value;
    void activeConnectionId.value;
    void sidebarVisible.value;
    void sidebarTab.value;
    void resultPanelTab.value;
    void layoutSizes.value;
    const id = setTimeout(persistSession, 400);
    return () => clearTimeout(id);
  });
  useEffect(() => {
    const h = () => persistSession();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // (Re)build the split panes using the persisted sizes, recording drags back
  // into layoutSizes so the ratios survive a restart.
  const buildSplits = () => {
    horizontalSplit.current?.destroy();
    verticalSplit.current?.destroy();
    if (!horizontalRef.current || !verticalRef.current) return;
    const { sidebar: sb, editor: ed } = layoutSizes.value;

    const hChildren = Array.from(horizontalRef.current.children) as HTMLElement[];
    if (hChildren.length === 2) {
      horizontalSplit.current = Split([hChildren[0], hChildren[1]], {
        sizes: sidebarVisible.value ? [sb, 100 - sb] : [0, 100],
        minSize: [0, 300],
        gutterSize: sidebarVisible.value ? 4 : 0,
        snapOffset: 0,
        direction: 'horizontal',
        cursor: 'col-resize',
        onDragEnd: (sizes) => {
          if (sidebarVisible.value && sizes[0] > 1) {
            layoutSizes.value = { ...layoutSizes.value, sidebar: Math.round(sizes[0]) };
          }
        },
      });
    }

    const vChildren = Array.from(verticalRef.current.children) as HTMLElement[];
    if (vChildren.length === 2) {
      verticalSplit.current = Split(vChildren, {
        sizes: [ed, 100 - ed],
        minSize: [100, 60],
        gutterSize: 4,
        snapOffset: 0,
        direction: 'vertical',
        cursor: 'row-resize',
        onDragEnd: (sizes) => {
          layoutSizes.value = { ...layoutSizes.value, editor: Math.round(sizes[0]) };
        },
      });
    }
  };

  useEffect(() => {
    buildSplits();
    return () => {
      horizontalSplit.current?.destroy();
      verticalSplit.current?.destroy();
    };
  }, []);

  // Toggle sidebar: adjust split sizes instead of removing from DOM.
  // peek() the width so this only re-runs on visibility change, not on drag.
  useSignalEffect(() => {
    const visible = sidebarVisible.value;
    const split = horizontalSplit.current;
    if (!split) return;
    const sb = layoutSizes.peek().sidebar;
    if (visible) {
      split.setSizes([sb, 100 - sb]);
    } else {
      split.setSizes([0, 100]);
    }
    // Toggle gutter visibility
    const gutter = (horizontalRef.current?.parentElement as HTMLElement)
      ?.querySelector('.gutter-horizontal') as HTMLElement | null;
    if (gutter) {
      gutter.style.display = visible ? '' : 'none';
    }
  });

  // Listen for layout update events (triggered after sidebar toggle)
  useEffect(() => {
    const handler = () => buildSplits();
    window.addEventListener('mercury:layout', handler);
    return () => window.removeEventListener('mercury:layout', handler);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      <Toolbar />
      <div
        ref={horizontalRef}
        style={{ display: 'flex', flex: 1, overflow: 'hidden' }}
      >
        <div ref={sidebarRef} style={{
          overflow: 'hidden', minWidth: 0,
          display: sidebarVisible.value ? '' : 'none',
        }}>
          <ErrorBoundary fallbackMessage="Sidebar panel crashed">
            <Sidebar />
          </ErrorBoundary>
        </div>
        <div ref={mainAreaRef} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, flex: 1 }}>
          <div ref={verticalRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div ref={editorAreaRef} style={{ overflow: 'hidden', minHeight: 0 }}>
              <ErrorBoundary fallbackMessage="Editor panel crashed">
                <EditorPanel />
              </ErrorBoundary>
            </div>
            <div ref={resultAreaRef} style={{ overflow: 'hidden', minHeight: 0 }}>
              <ErrorBoundary fallbackMessage="Results panel crashed">
                <ResultPanel />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
      <StatusBar />
      <ConnectionPalette />
      <ConfirmCloseDialog />
      <KeyboardShortcuts />
      <AlignDialog />
      <PoppedCharts />
    </div>
  );
}
