/**
 * Detached ("popped-out") chart windows.
 *
 * Each entry opens a REAL browser window (`window.open`) that can be dragged out
 * of the app entirely — onto another monitor if you like. We render the live,
 * interactive `ChartPanel` into that window via a portal, over a FROZEN snapshot
 * of the result + config, so it keeps its own axes/zoom and later queries never
 * touch it. The app's stylesheet + current theme are mirrored into the window so
 * it looks identical.
 */

import { useEffect, useState } from 'preact/hooks';
import { useSignalEffect } from '@preact/signals';
import { createPortal } from 'preact/compat';
import { poppedCharts, closePoppedChart, theme } from '../store';
import type { PoppedChart, ChartConfig } from '../store';
import { ChartPanel } from './ChartPanel';

export function PoppedCharts() {
  const list = poppedCharts.value;
  if (list.length === 0) return null;
  return <>{list.map(e => <PopoutWindow key={e.id} entry={e} />)}</>;
}

/** Clone every app stylesheet into the detached window so CSS vars resolve. */
function mirrorStyles(doc: Document) {
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
    try {
      const clone = node.cloneNode(true) as HTMLElement;
      // about:blank has no base URL, so relative <link href> would break —
      // pin it to the absolute URL the property resolves to.
      if (clone.tagName === 'LINK') clone.setAttribute('href', (node as HTMLLinkElement).href);
      doc.head.appendChild(clone);
    } catch { /* ignore a style that refuses to clone */ }
  });
}

function PopoutWindow({ entry }: { entry: PoppedChart }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [cfg, setCfg] = useState<ChartConfig>(entry.config);
  const [needsRender, setNeedsRender] = useState(true);

  useEffect(() => {
    const w = entry.win;
    if (!w) { closePoppedChart(entry.id); return; }
    const doc = w.document;
    doc.title = (entry.config.title || 'mercury chart') + ' — detached';
    doc.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') || 'light');
    doc.head.innerHTML = '';
    doc.body.innerHTML = '';
    doc.body.style.margin = '0';
    mirrorStyles(doc);
    const root = doc.createElement('div');
    root.style.height = '100vh';
    root.style.width = '100vw';
    root.style.overflow = 'hidden';
    root.style.background = 'var(--bg)';
    doc.body.appendChild(root);
    setContainer(root);

    // Closing the window (its X) removes the entry; closing the app closes it.
    const onChildClose = () => closePoppedChart(entry.id);
    w.addEventListener('pagehide', onChildClose);
    const onParentClose = () => { try { w.close(); } catch { /* already gone */ } };
    window.addEventListener('beforeunload', onParentClose);

    // If the window is already gone (blocked/closed), don't leave a dangling entry.
    const poll = window.setInterval(() => { if (w.closed) { window.clearInterval(poll); closePoppedChart(entry.id); } }, 800);

    return () => {
      window.clearInterval(poll);
      w.removeEventListener('pagehide', onChildClose);
      window.removeEventListener('beforeunload', onParentClose);
      try { w.close(); } catch { /* already gone */ }
    };
  }, []);

  // Keep the detached window's theme in step with the app.
  useSignalEffect(() => {
    const t = theme.value;
    const w = entry.win;
    if (w && !w.closed) {
      try { w.document.documentElement.setAttribute('data-theme', t); } catch { /* ignore */ }
    }
  });

  if (!container) return null;
  return createPortal(
    <div style={{ height: '100%', width: '100%' }}>
      <ChartPanel data={entry.data} config={cfg} needsRender={needsRender}
        onUpdateConfig={c => { setCfg(c); setNeedsRender(true); }}
        onRendered={() => setNeedsRender(false)} />
    </div>,
    container,
  );
}
