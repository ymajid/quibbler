import { useState, useEffect } from 'preact/hooks';

interface ShortcutEntry {
  keys: string;
  action: string;
}

const shortcuts: ShortcutEntry[] = [
  { keys: 'Ctrl+Enter', action: 'Execute query' },
  { keys: 'Ctrl+P', action: 'Switch connection' },
  { keys: 'Ctrl+N', action: 'New tab' },
  { keys: 'Ctrl+W', action: 'Close tab' },
  { keys: 'Ctrl+S', action: 'Save file' },
  { keys: 'Ctrl+Shift+A', action: 'Align selection on delimiter' },
  { keys: 'Ctrl+L', action: 'Toggle word wrap' },
  { keys: 'Ctrl+1', action: 'Switch to Result tab' },
  { keys: 'Ctrl+2', action: 'Switch to Chart tab' },
  { keys: 'Ctrl+3', action: 'Switch to Console tab' },
  { keys: 'Ctrl+4', action: 'Switch to History tab' },
  { keys: 'Escape', action: 'Close palette / dialogs' },
];

export function KeyboardShortcuts() {
  const [visible, setVisible] = useState(false);

  // Listen for custom event from toolbar "?" button
  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener('mercury:shortcuts', handler);
    return () => window.removeEventListener('mercury:shortcuts', handler);
  }, []);

  // Listen for keyboard triggers at document level
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // '?' key (unshifted '/') or Ctrl+/ opens the modal
      if (e.key === '?' || (e.key === '/' && (e.ctrlKey || e.metaKey))) {
        // Don't trigger if user is typing in an input/textarea
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
          // Still allow when no input is focused — let Ctrl+/ through
          if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
            // Let it through
          } else {
            return;
          }
        }
        e.preventDefault();
        setVisible(v => !v);
      }
      if (e.key === 'Escape' && visible) {
        setVisible(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'var(--bg-overlay)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => setVisible(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-toolbar)',
          borderRadius: '6px',
          width: '440px',
          maxWidth: '90vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          color: 'var(--text-bright)',
          fontSize: '14px',
          fontWeight: 'bold',
        }}>
          Keyboard Shortcuts
        </div>
        <div style={{ padding: '8px 0' }}>
          {shortcuts.map((s, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '7px 16px',
                fontSize: '12px',
              }}
            >
              <span style={{ color: 'var(--text-bright)' }}>{s.action}</span>
              <kbd style={{
                background: 'var(--bg-input)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                padding: '2px 7px',
                fontSize: '11px',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}>
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border)',
          color: 'var(--text-dim)',
          fontSize: '11px',
          textAlign: 'center',
        }}>
          Press <kbd style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            padding: '1px 5px',
            fontSize: '11px',
            fontFamily: 'inherit',
          }}>?</kbd> or <kbd style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            padding: '1px 5px',
            fontSize: '11px',
            fontFamily: 'inherit',
          }}>Ctrl+/</kbd> to toggle
        </div>
      </div>
    </div>
  );
}
