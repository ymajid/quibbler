import { confirmClosePath, editorTabs, closeTab, markTabClean, addConsoleMessage, saveDialogVisible, saveDialogDefaultName, saveDialogContent } from '../store';
import * as bridge from '../bridge';

export function ConfirmCloseDialog() {
  const filePath = confirmClosePath.value;
  if (!filePath) return null;

  // Re-read at render time to avoid stale content
  const tab = editorTabs.value.find(t => t.path === filePath);
  if (!tab) { confirmClosePath.value = null; return null; }

  const handleSave = () => {
    // Re-read tab to get latest content (user may have typed after dialog appeared)
    const currentTab = editorTabs.value.find(t => t.path === filePath);
    if (!currentTab) { confirmClosePath.value = null; return; }

    if (currentTab.path.startsWith('untitled:')) {
      // Untitled — show Save-As dialog instead of silently discarding
      saveDialogDefaultName.value = currentTab.name;
      saveDialogContent.value = currentTab.content;
      saveDialogVisible.value = true;
    } else {
      try {
        bridge.saveFile(currentTab.path, currentTab.content);
        markTabClean(currentTab.path);
        addConsoleMessage('Saved: ' + currentTab.path);
      } catch (e: any) {
        addConsoleMessage('Save failed: ' + e.message, 'error');
      }
      closeTab(filePath);
    }
    confirmClosePath.value = null;
  };

  const handleDiscard = () => {
    closeTab(filePath);
    confirmClosePath.value = null;
  };

  const handleCancel = () => {
    confirmClosePath.value = null;
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'var(--bg-overlay)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-toolbar)', borderRadius: '6px', width: '380px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '20px',
      }}>
        <div style={{ color: 'var(--text-bright)', fontSize: '14px', marginBottom: '8px', fontWeight: 'bold' }}>
          Unsaved changes
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '20px' }}>
          "{tab.name}" has unsaved changes. Save before closing?
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={handleCancel}
            style={{ ...btn, background: 'var(--bg-input)', color: 'var(--text-bright)' }}>
            Cancel
          </button>
          <button onClick={handleDiscard}
            style={{ ...btn, background: 'var(--status-error)', color: 'var(--text-white)' }}>
            Don't Save
          </button>
          <button onClick={handleSave}
            style={{ ...btn, background: 'var(--accent-btn)', color: 'var(--text-white)' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const btn = {
  padding: '5px 14px', border: '1px solid #555', borderRadius: '3px',
  cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
};
