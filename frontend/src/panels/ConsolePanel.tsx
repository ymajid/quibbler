import { useRef, useEffect } from 'preact/hooks';
import { consoleMessages, clearConsole } from '../store';

export function ConsolePanel() {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleMessages.value.length]);

  const messages = consoleMessages.value;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '4px 8px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <button
          onClick={clearConsole}
          style={{
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'inherit',
            padding: '2px 8px',
          }}
        >
          Clear
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', fontFamily: 'monospace', fontSize: '12px' }}>
        {messages.length === 0 && (
          <div style={{ padding: '12px 16px', color: 'var(--text-dim)' }}>
            Console output from queries will appear here (info, results, errors).
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              padding: '2px 16px',
              color: msg.type === 'error' ? 'var(--status-error)'
                     : msg.type === 'result' ? 'var(--syntax-teal)'
                     : 'var(--text)',
              borderBottom: '1px solid #2d2d2d',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            <span style={{ color: 'var(--text-dim)', marginRight: '8px', fontSize: '10px' }}>
              {formatTime(msg.timestamp)}
            </span>
            {msg.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString();
  } catch {
    return '';
  }
}
