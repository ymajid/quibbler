import { useState, useEffect, useRef } from 'preact/hooks';
import { alignDialog } from '../store';

/**
 * Align-on-delimiter dialog (align.nvim style). Opened from the editor over a
 * multi-line selection; you pick the delimiter to align on and it pads each line
 * so that delimiter lands in the same column. Applied via the quibbler:applyAlign
 * event, handled in EditorPanel.
 */
const COMMON = [':', '/', ',', '|', '=', ';'];

export function AlignDialog() {
  const req = alignDialog.value;
  const [delim, setDelim] = useState(':');
  const [spaceAfter, setSpaceAfter] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (req) setTimeout(() => inputRef.current?.focus(), 40);
  }, [req]);

  if (!req) return null;

  const apply = () => {
    if (!delim) return;
    window.dispatchEvent(new CustomEvent('quibbler:applyAlign', {
      detail: { startLine: req.startLine, endLine: req.endLine, delim, padAfter: spaceAfter ? 1 : 0 },
    }));
    alignDialog.value = null;
  };

  const lineCount = req.endLine - req.startLine + 1;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '18vh' }}
      onClick={e => { if ((e.target as HTMLElement).dataset.overlay === 'true') alignDialog.value = null; }}
      data-overlay="true">
      <div style={{ background: 'var(--bg-toolbar)', borderRadius: '6px', width: '360px', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-bright)' }}>
          Align {lineCount} line{lineCount !== 1 ? 's' : ''} on…
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input ref={inputRef} value={delim}
            onInput={e => setDelim((e.target as HTMLInputElement).value)}
            onKeyDown={e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') alignDialog.value = null; }}
            placeholder="delimiter, e.g. :"
            style={{ background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid var(--border-strong)', padding: '6px 8px', borderRadius: '3px', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }}
          />
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {COMMON.map(d => (
              <button key={d} onClick={() => setDelim(d)}
                style={{ background: delim === d ? 'var(--accent-btn)' : 'var(--bg-input)', color: delim === d ? 'var(--text-white)' : 'var(--text-bright)', border: '1px solid var(--border-strong)', borderRadius: '3px', cursor: 'pointer', fontSize: '12px', padding: '3px 9px', fontFamily: 'monospace' }}>
                {d}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>
            <input type="checkbox" checked={spaceAfter} onChange={e => setSpaceAfter((e.target as HTMLInputElement).checked)} style={{ margin: 0 }} />
            space after the delimiter
          </label>
        </div>
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={() => alignDialog.value = null} style={{ ...btn, background: 'var(--bg-input)', color: 'var(--text-bright)' }}>Cancel</button>
          <button onClick={apply} style={{ ...btn, background: 'var(--accent-btn)', color: 'var(--text-white)' }}>Align</button>
        </div>
      </div>
    </div>
  );
}

const btn = { padding: '5px 16px', border: '1px solid var(--border-strong)', borderRadius: '3px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' as const };
