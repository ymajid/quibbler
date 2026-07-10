/**
 * mercury — main entry point.
 *
 * Mounts the Preact application, initializes the Monaco editor,
 * and sets up the panel layout.
 */

import { render } from 'preact';
import { App } from './panels/App';

// Wait for DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    render(<App />, root);
  }
});
