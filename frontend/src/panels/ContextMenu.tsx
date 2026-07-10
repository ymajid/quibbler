import { useEffect, useRef } from 'preact/hooks';

interface ContextMenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  separator?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Auto-position: flip if off-screen
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let adjustedX = x;
    let adjustedY = y;

    if (rect.right > vw) {
      adjustedX = x - rect.width;
    }
    if (rect.bottom > vh) {
      adjustedY = y - rect.height;
    }

    // Constrain to viewport edges
    adjustedX = Math.max(4, Math.min(adjustedX, vw - rect.width - 4));
    adjustedY = Math.max(4, Math.min(adjustedY, vh - rect.height - 4));

    el.style.left = adjustedX + 'px';
    el.style.top = adjustedY + 'px';
  }, [x, y]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the same click that opened the menu closing it
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: x + 'px',
        top: y + 'px',
        zIndex: 2000,
        minWidth: '160px',
        background: 'var(--bg-toolbar)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        padding: '4px 0',
        fontSize: '12px',
        userSelect: 'none',
      }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return (
            <div
              key={i}
              style={{
                height: '1px',
                margin: '4px 8px',
                background: 'var(--border)',
              }}
            />
          );
        }
        return (
          <div
            key={i}
            onClick={() => {
              if (!item.disabled) {
                item.action();
                onClose();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 12px',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.disabled ? 'var(--text-dim)' : 'var(--text-bright)',
              background: 'transparent',
              opacity: item.disabled ? 0.4 : 1,
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span style={{ color: 'var(--text-dim)', marginLeft: '24px', fontSize: '11px' }}>
                {item.shortcut}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
