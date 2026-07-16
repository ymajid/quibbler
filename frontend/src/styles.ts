/**
 * Shared UI Styles — quibbler IDE
 *
 * Single source of truth for all reusable inline style objects used across
 * panel components.
 *
 * Every color value references a CSS custom property defined in `index.html`
 * so that light/dark theming works automatically.  This file is the
 * replacement for scattered local constants (`btnStyle`, `inputStyle`,
 * `thStyle`, `tdStyle`, `tabStyle`, `smallBtnStyle`, etc.) that were
 * previously duplicated across individual panel files.
 *
 * Usage:
 *   import { primaryButton, textInput, tableHeader } from '../styles';
 *   <button style={primaryButton}>Run</button>
 */

import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/** Convenience alias for React.CSSProperties. */
type Style = CSSProperties;

// ===========================================================================
// 1. Buttons
// ===========================================================================

/**
 * Primary action button  —  accent-filled background, bold white text.
 *
 * Use for: Run query, Save, Add Connection, and similar primary CTAs.
 *
 * @note For a disabled appearance override `background` with
 *       `'var(--border-strong)'` and `cursor` with `'default'`.
 */
export const primaryButton: Style = {
  background: 'var(--accent-btn)',
  color: 'var(--text-white)',
  border: 'none',
  padding: '4px 10px',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  fontFamily: 'inherit',
  outline: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

/**
 * Secondary / subtle action button  —  neutral input background with border.
 *
 * Use for: Cancel (in forms), Test, and other dismissive or supplementary
 * actions.
 */
export const secondaryButton: Style = {
  background: 'var(--bg-input)',
  color: 'var(--text-bright)',
  border: '1px solid var(--border-strong)',
  padding: '3px 10px',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '12px',
  fontFamily: 'inherit',
  outline: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

/**
 * Destructive action button  —  error-coloured background, white text.
 *
 * Use for: Cancel running query, delete operations.
 */
export const dangerButton: Style = {
  background: 'var(--status-error)',
  color: 'var(--text-white)',
  border: 'none',
  padding: '4px 10px',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '12px',
  fontFamily: 'inherit',
  outline: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

/**
 * Toolbar chrome button  —  transparent background, brighter text, rounded.
 *
 * Use for: sidebar toggle (☰), and other toolbar-level controls.
 */
export const toolbarButton: Style = {
  background: 'transparent',
  color: 'var(--text-bright)',
  border: 'none',
  padding: '4px 8px',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '14px',
  fontFamily: 'inherit',
  outline: 'none',
  lineHeight: 1,
  flexShrink: 0,
};

/**
 * Ghost / icon-only button  —  transparent, no border, dim text.
 *
 * Use for: edit (✎), remove (×) inside list rows, bulk actions in lists.
 */
export const iconButton: Style = {
  background: 'transparent',
  color: 'var(--text-dim)',
  border: 'none',
  cursor: 'pointer',
  fontSize: '11px',
  padding: '2px 3px',
  fontFamily: 'inherit',
  outline: 'none',
  lineHeight: 1,
  flexShrink: 0,
};

/**
 * Compact visible button  —  input background, medium glyph.
 *
 * Use for: directory-navigation buttons, small inline controls that need
 * a visible hit target.
 */
export const smallButton: Style = {
  background: 'var(--bg-input)',
  color: 'var(--text-bright)',
  border: '1px solid var(--border-strong)',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '14px',
  padding: '2px 8px',
  fontFamily: 'inherit',
  outline: 'none',
  lineHeight: 1,
  flexShrink: 0,
};

/**
 * Minimal ghost button  —  no background, no border, secondary colour.
 *
 * Use for: theme toggle (🌙/☀️), status-bar actions, low-prominence chrome.
 */
export const ghostButton: Style = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  padding: '2px 6px',
  fontFamily: 'inherit',
  outline: 'none',
  lineHeight: 1,
  flexShrink: 0,
};

// ===========================================================================
// 2. Inputs
// ===========================================================================

/**
 * Standard text input / form field.
 *
 * Use for: name, host, username, password, filename, and other text fields.
 *
 * @note The `width: 100%` makes it fill its parent. Override with an
 *       explicit `width` or `flex:` when a smaller size is needed.
 */
export const textInput: Style = {
  width: '100%',
  background: 'var(--bg-input)',
  color: 'var(--text-bright)',
  border: '1px solid var(--border-strong)',
  padding: '4px 6px',
  borderRadius: '3px',
  fontSize: '12px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  marginTop: '2px',
};

/**
 * Select / dropdown element.
 *
 * Use for: connection selector in toolbar.
 */
export const selectInput: Style = {
  background: 'var(--bg-input)',
  color: 'var(--text-bright)',
  border: '1px solid var(--border-strong)',
  padding: '3px 6px',
  borderRadius: '3px',
  fontSize: '12px',
  outline: 'none',
  fontFamily: 'inherit',
};

/**
 * Inline filter input inside a table header.
 *
 * Uses the syntax-teal border colour to visually signal filtering state.
 */
export const filterInput: Style = {
  width: '100%',
  background: 'var(--bg-input)',
  color: 'var(--syntax-teal)',
  border: '1px solid var(--syntax-teal)',
  padding: '0 4px',
  borderRadius: '2px',
  fontSize: '11px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  marginTop: '2px',
};

/**
 * Label adjacent to a checkbox control.
 */
export const checkboxLabel: Style = {
  color: 'var(--text-secondary)',
  fontSize: '12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

/**
 * Small form-field header label (Name, Host, Group, etc.).
 */
export const inputLabel: Style = {
  color: 'var(--text-secondary)',
  fontSize: '10px',
  fontFamily: 'inherit',
};

// ===========================================================================
// 3. Layout
// ===========================================================================

/**
 * Top toolbar bar  —  flex row with bottom border.
 *
 * Outer container for the topmost chrome (hamburger, connection selector,
 * Run, Cancel, theme toggle).
 */
export const toolbar: Style = {
  display: 'flex',
  alignItems: 'center',
  height: '36px',
  padding: '0 8px',
  background: 'var(--bg-toolbar)',
  borderBottom: '1px solid var(--border)',
  gap: '8px',
  userSelect: 'none',
  flexShrink: 0,
};

/**
 * Panel tab-bar container  —  flex row with top and bottom borders.
 *
 * Use for: the result-panel tab bar (result / chart / console / history).
 *
 * @see resultTab
 */
export const panelHeader: Style = {
  display: 'flex',
  height: '28px',
  background: 'var(--bg-panel)',
  borderTop: '1px solid var(--border)',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

/**
 * Minimal tab-bar container  —  just a bottom border.
 *
 * Use for: sidebar tab bar (connections / schema / files).
 *
 * @see sidebarTab
 */
export const tabBar: Style = {
  display: 'flex',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

/**
 * Sidebar outer container  —  full-height flex column.
 */
export const sidebar: Style = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-toolbar)',
  borderRight: '1px solid var(--border)',
  minWidth: '180px',
};

/**
 * Result-panel outer container  —  full-height flex column.
 */
export const resultPanel: Style = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg)',
  overflow: 'hidden',
};

/**
 * Status bar  —  bottom strip with dim text and a top border.
 *
 * Use for: connection counts, status indicators, footer info.
 */
export const statusBar: Style = {
  padding: '4px 12px',
  fontSize: '11px',
  color: 'var(--text-dim)',
  borderTop: '1px solid var(--border)',
  flexShrink: 0,
  fontFamily: 'inherit',
};

/**
 * Empty / placeholder state  —  centered dim text.
 *
 * Use for: "No connections", "Run a query to see results" messages.
 */
export const emptyState: Style = {
  padding: '20px',
  color: 'var(--text-dim)',
  textAlign: 'center',
  fontFamily: 'inherit',
};

/**
 * Error message block  —  monospace, error colour.
 */
export const errorBlock: Style = {
  padding: '12px 16px',
  color: 'var(--status-error)',
  fontFamily: 'monospace',
  fontSize: '13px',
};

/**
 * Connection row  —  list item with active-indicator border.
 *
 * Use inside connection / schema lists.  Accepts the indentation depth
 * as `paddingLeft` (base 12px, depth * 14px).
 *
 * @example
 *   <div style={{ ...connectionRow, paddingLeft: `${12 + depth * 14}px` }}>
 */
export const connectionRow: Style = {
  padding: '6px 12px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

/**
 * Active connection row — overrides for the selected state.
 *
 * Spread **after** `connectionRow` so it wins on conflicting keys:
 *
 * @example
 *   <div style={{
 *     ...connectionRow,
 *     ...(isActive ? activeConnectionRow : inactiveConnectionRow),
 *     paddingLeft: `${12 + depth * 14}px`,
 *   }}>
 */
export const activeConnectionRow: Style = {
  background: 'var(--bg-hover)',
  borderLeft: '3px solid var(--accent)',
};

export const inactiveConnectionRow: Style = {
  background: 'transparent',
  borderLeft: '3px solid transparent',
};

// ===========================================================================
// 4. Table
// ===========================================================================

/**
 * Sticky table header cell (`<th>`).
 *
 * Remains at the top of the scroll container when the table body scrolls.
 */
export const tableHeader: Style = {
  position: 'sticky',
  top: 0,
  background: 'var(--bg-panel)',
  color: 'var(--text-secondary)',
  fontWeight: 'bold',
  padding: '0 4px',
  textAlign: 'left',
  borderBottom: '2px solid var(--border-strong)',
  whiteSpace: 'nowrap',
  zIndex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontSize: '11px',
  lineHeight: '18px',
  fontFamily: 'inherit',
  userSelect: 'none',
};

/**
 * Table data cell (`<td>`).
 *
 * Monospace content, clipped with ellipsis when it overflows.
 */
export const tableCell: Style = {
  padding: '0 4px',
  borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  textAlign: 'left',
  maxWidth: '500px',
  fontSize: '11px',
  lineHeight: '18px',
  fontFamily: 'monospace',
  cursor: 'pointer',
};

/**
 * Wrapping `<table>` element  —  collapsed borders, monospace.
 */
export const tableElement: Style = {
  borderCollapse: 'collapse',
  borderSpacing: '0',
  fontSize: '11px',
  fontFamily: 'monospace',
  width: 'max-content',
  minWidth: '100%',
};

/**
 * Table container  —  scrollable wrapper that fills available vertical space.
 */
export const tableContainer: Style = {
  flex: 1,
  overflow: 'auto',
  background: 'var(--bg)',
};

/**
 * Row-count / action bar  —  sits above the table with metadata and controls.
 */
export const rowCountBar: Style = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 12px',
  fontSize: '11px',
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
  gap: '8px',
  fontFamily: 'inherit',
};

/**
 * Column resize handle  —  invisible hit area at the right edge of a `<th>`.
 */
export const resizeHandle: Style = {
  position: 'absolute',
  right: 0,
  top: 0,
  bottom: 0,
  width: '5px',
  cursor: 'col-resize',
  background: 'transparent',
  zIndex: 2,
};

// ===========================================================================
// 5. Tabs  (active / inactive factory functions)
// ===========================================================================

/**
 * Sidebar tab  —  flex-grow, equal-width buttons for the sidebar tab bar.
 *
 * @param active  `true` for the currently selected tab.
 *
 * Use for: connections / schema / files tabs.
 */
export const sidebarTab = (active: boolean): Style => ({
  flex: 1,
  padding: '6px 8px',
  background: active ? 'var(--bg)' : 'transparent',
  color: active ? 'var(--text-bright)' : 'var(--text-secondary)',
  border: 'none',
  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  cursor: 'pointer',
  fontSize: '12px',
  fontFamily: 'inherit',
  outline: 'none',
  whiteSpace: 'nowrap',
});

/**
 * Result-panel tab  —  fixed-height buttons for the result-area tab bar.
 *
 * @param active  `true` for the currently selected tab.
 *
 * Use for: result / chart / console / history tabs.
 */
export const resultTab = (active: boolean): Style => ({
  padding: '4px 12px',
  background: active ? 'var(--bg)' : 'transparent',
  color: active ? 'var(--text-bright)' : 'var(--text-secondary)',
  border: 'none',
  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  cursor: 'pointer',
  fontSize: '12px',
  fontFamily: 'inherit',
  outline: 'none',
  whiteSpace: 'nowrap',
  lineHeight: '20px',
});

/**
 * Editor tab  —  used in an editor tab strip (e.g. open query files).
 *
 * @param active  `true` for the currently focused editor tab.
 *
 * Active tabs typically have a stronger background and a full-width accent
 * border along the bottom; inactive tabs are dimmer and flush.
 */
export const editorTab = (active: boolean): Style => ({
  padding: '6px 12px',
  background: active ? 'var(--bg)' : 'var(--bg-toolbar)',
  color: active ? 'var(--text-bright)' : 'var(--text-secondary)',
  border: 'none',
  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  borderRight: '1px solid var(--border)',
  cursor: 'pointer',
  fontSize: '12px',
  fontFamily: 'inherit',
  outline: 'none',
  whiteSpace: 'nowrap',
  userSelect: 'none',
});

// ===========================================================================
// 6. Overlays
// ===========================================================================

/**
 * Full-screen modal backdrop  —  covers the viewport behind a dialog.
 *
 * Click-to-dismiss can be implemented by adding
 * `data-overlay="true"` and checking `e.target.dataset.overlay`.
 */
export const modalBackdrop: Style = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'var(--bg-overlay)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/**
 * Modal dialog container  —  floating panel with rounded corners and shadow.
 */
export const modalContainer: Style = {
  background: 'var(--bg-toolbar)',
  borderRadius: '6px',
  width: '500px',
  maxHeight: '500px',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: 'var(--shadow)',
  overflow: 'hidden',
};

/**
 * Modal header bar  —  title text with a bottom divider.
 */
export const modalHeader: Style = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  fontSize: '14px',
  fontWeight: 'bold',
  color: 'var(--text-bright)',
  fontFamily: 'inherit',
};

/**
 * Modal footer / button row  —  right-aligned actions with top divider.
 */
export const modalFooter: Style = {
  padding: '10px 12px',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
};

/**
 * Command-palette / quick-search overlay  —  centred, narrower than a
 * full modal, with a floating shadow.
 */
export const paletteContainer: Style = {
  background: 'var(--bg-toolbar)',
  borderRadius: '6px',
  width: '400px',
  maxHeight: '400px',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: 'var(--shadow)',
  overflow: 'hidden',
};

// ===========================================================================
// 7. Typography
// ===========================================================================

/**
 * Monospace label  —  for directory paths, filename displays, code excerpts.
 */
export const monoLabel: Style = {
  fontFamily: 'monospace',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/**
 * Dim / secondary label  —  for metadata, timestamps, helper text.
 */
export const dimLabel: Style = {
  color: 'var(--text-dim)',
  fontSize: '11px',
  fontFamily: 'inherit',
};

/**
 * Section header  —  group headings, category titles in sidebars.
 */
export const sectionHeader: Style = {
  color: 'var(--text-secondary)',
  fontSize: '11px',
  fontFamily: 'inherit',
  padding: '4px 8px',
  userSelect: 'none',
};

// ===========================================================================
// 8. Utility helpers
// ===========================================================================

/**
 * Simple flex row  —  horizontal layout with centred children.
 */
export const flexRow: Style = {
  display: 'flex',
  alignItems: 'center',
};

/**
 * Simple flex column  —  vertical layout.
 */
export const flexColumn: Style = {
  display: 'flex',
  flexDirection: 'column',
};

/**
 * Inline monospace result text  —  for value displays in result panels.
 */
export const monoText: Style = {
  fontFamily: 'monospace',
  fontSize: '14px',
  color: 'var(--text)',
};

/**
 * Inline clickable action  —  dim text with pointer cursor.
 *
 * Use for: "Copy All", "CSV", "Fit" links in the row-count bar.
 */
export const clickableAction: Style = {
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  fontSize: '11px',
  fontFamily: 'inherit',
};
