import { useEffect, useState } from 'preact/hooks';
import { resultPanelTab, queryResult, queryRunning, queryId, chartConfig, chartConfigs, chartNeedsRender, resultHistory, resultHistoryIndex, showResultAt } from '../store';
import { TableRenderer } from '../renderers/TableRenderer';
import { DictRenderer } from '../renderers/DictRenderer';
import { ListRenderer } from '../renderers/ListRenderer';
import { ConsolePanel } from './ConsolePanel';
import { HistoryPanel } from './HistoryPanel';
import { ChartPanel } from './ChartPanel';
import { formatKdbInline } from '../renderers/kdbFormat';
import type { QueryResult } from '../bridge';

export function ResultPanel() {
  const tab = resultPanelTab.value;
  const result = queryResult.value;
  const running = queryRunning.value;

  // Lazy-mount the chart: don't create the ECharts instance (or render per query)
  // until the user first opens the Chart tab — then keep it mounted so config +
  // zoom survive tab switches. Non-charting users pay nothing.
  const [chartMounted, setChartMounted] = useState(false);
  useEffect(() => { if (tab === 'chart') setChartMounted(true); }, [tab]);

  // Listen for Ctrl+1/2/3/4 at document level to switch result panel tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['1', '2', '3', '4'].includes(e.key)) {
        // Let the editor handle its own Ctrl+1/2/3/4 if it is focused
        if (document.activeElement?.closest('.monaco-editor')) return;
        e.preventDefault();
        const map: Record<string, 'result' | 'chart' | 'console' | 'history'> = {
          '1': 'result',
          '2': 'chart',
          '3': 'console',
          '4': 'history',
        };
        resultPanelTab.value = map[e.key] || 'result';
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', height: '28px', background: 'var(--bg-panel)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', flexShrink: 0, alignItems: 'center' }}>
        {(['result', 'chart', 'console', 'history'] as const).map(t => (
          <button key={t} onClick={() => resultPanelTab.value = t}
            style={tabStyle(tab === t)}>
            {t === 'result' ? '📊 Result' : t === 'chart' ? '📈 Chart' : t === 'console' ? '📝 Console' : '🕐 History'}
            {t === 'result' && running ? ' (running...)' : ''}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <ResultHistoryNav />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'result' && <ResultContent result={result} running={running} />}
        {/* Once opened, the chart stays mounted (hidden) so its axes/group config
            AND zoom survive switching result tabs — no reconfigure, no re-render. */}
        {chartMounted && (
          <div style={{ display: tab === 'chart' ? 'block' : 'none', height: '100%' }}>
            <ChartPanelWrapper result={result} />
          </div>
        )}
        {tab === 'console' && <ConsolePanel />}
        {tab === 'history' && <HistoryPanel />}
      </div>
    </div>
  );
}

/** Scroll back/forward through the last few unique results. */
function ResultHistoryNav() {
  const hist = resultHistory.value;
  const idx = resultHistoryIndex.value;
  if (hist.length < 2) return null;
  const snap = hist[idx];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1px', padding: '0 6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
      <button disabled={idx >= hist.length - 1} onClick={() => showResultAt(idx + 1)}
        title="Older result" style={histBtn(idx >= hist.length - 1)}>‹</button>
      <span title={snap ? snap.text : 'result history'}
        style={{ fontVariantNumeric: 'tabular-nums', minWidth: '46px', textAlign: 'center', cursor: 'default' }}>
        {idx === 0 ? 'latest' : `${idx + 1} of ${hist.length}`}
      </span>
      <button disabled={idx <= 0} onClick={() => showResultAt(idx - 1)}
        title="Newer result" style={histBtn(idx <= 0)}>›</button>
    </div>
  );
}

function histBtn(disabled: boolean) {
  return {
    background: 'transparent', border: 'none', cursor: disabled ? 'default' : 'pointer',
    color: disabled ? 'var(--text-dim)' : 'var(--text-bright)', fontSize: '15px', lineHeight: 1,
    padding: '2px 6px', fontFamily: 'inherit', opacity: disabled ? 0.4 : 1,
  };
}

function ChartPanelWrapper({ result }: { result: QueryResult | null }) {
  if (!result) {
    return <div style={{ padding: '20px', color: 'var(--text-dim)', textAlign: 'center' }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>📈</div>
      Run a query returning a table or keyed table, then switch to the Chart tab.
    </div>;
  }

  // Unwrap keyed tables (dict where keys and values are both tables) into a flat table
  let tableData: any = result;
  let isKeyed = false;
  if (result.type === 'dict') {
    const keys = result.keys as any;
    const vals = result.values as any;
    if (keys?.type === 'table' && vals?.type === 'table') {
      isKeyed = true;
      const keyCols = (keys.columns as Array<{name: string; type: string}>) ?? [];
      const valCols = (vals.columns as Array<{name: string; type: string}>) ?? [];
      const keyRows = (keys.rows as unknown[][]) ?? [];
      const valRows = (vals.rows as unknown[][]) ?? [];
      const rowCount = Math.min(keyRows.length, valRows.length);
      const mergedCols = [...keyCols, ...valCols];
      const mergedRows: unknown[][] = [];
      for (let r = 0; r < rowCount; r++) mergedRows.push([...(keyRows[r] ?? []), ...(valRows[r] ?? [])]);
      tableData = { type: 'table', columns: mergedCols, rows: mergedRows, rowCount };
    }
  }

  if (tableData.type !== 'table') {
    return <div style={{ padding: '20px', color: 'var(--text-dim)', textAlign: 'center' }}>
      Charting requires a table or keyed table result.
    </div>;
  }

  // Per-result chart config — keyed by queryId so switching queries
  // preserves each result's chart settings
  const qid = queryId.value;
  const cols = (tableData.columns as Array<{name: string; type: string}>) ?? [];
  const configs = chartConfigs.value;
  let cfg = configs[qid];
  if (!cfg) {
    // Auto-detect columns on first view for this query
    const numeric = cols.filter(c => ['long','int','short','float','real','byte'].includes(c.type));
    const label = cols.filter(c => ['symbol','char','string'].includes(c.type));
    const keyCols = isKeyed ? (result.keys as any)?.columns?.map((c: any) => c.name) ?? [] : [];
    cfg = {
      type: 'line',
      xColumn: label[0]?.name ?? cols[0]?.name ?? '',
      yColumns: [numeric[0]?.name ?? cols[1]?.name ?? cols[0]?.name ?? ''],
      groupBy: keyCols.length > 0 ? keyCols : undefined,
      yAuto: true,  // untouched default — first explicit Y pick replaces it
    };
    chartConfigs.value = { ...configs, [qid]: cfg };
    chartNeedsRender.value = true;
  }

  // Reset needsRender when config changes
  const updateCfg = (c: typeof cfg) => {
    chartConfigs.value = { ...chartConfigs.value, [qid]: c };
    chartConfig.value = c;
    chartNeedsRender.value = true;
  };

  return <ChartPanel data={tableData} config={cfg}
    needsRender={chartNeedsRender.value}
    onUpdateConfig={updateCfg}
    onRendered={() => { chartNeedsRender.value = false; }} />;
}

function ResultContent({ result, running }: { result: QueryResult | null; running: boolean }) {
  if (running) {
    return <div style={{ padding: '20px', color: 'var(--text-secondary)', textAlign: 'center' }}>Executing query...</div>;
  }
  if (!result) {
    return <div style={{ padding: '20px', color: 'var(--text-dim)', textAlign: 'center' }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>⌨</div>
      Type a q expression and press <b>Ctrl+Enter</b> to execute.
    </div>;
  }
  if (result.type === 'error') {
    return <div style={{ padding: '12px 16px', color: 'var(--status-error)', fontFamily: 'monospace', fontSize: '13px' }}>⨯ {result.message as string}</div>;
  }
  if (result.type === 'atom') {
    const v = result.v;
    const text = formatKdbInline(result);
    if (v === null || v === undefined) {
      // Assignments, side-effecting statements, etc. return the generic null (::).
      // Say plainly that it worked so it's not mistaken for "nothing happened".
      return <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: 'var(--status-ok)', fontSize: '15px', lineHeight: 1 }}>✓</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          Executed — no value returned
          <span style={{ color: 'var(--text-dim)', fontFamily: 'monospace', marginLeft: '8px' }}>(::)</span>
        </span>
      </div>;
    }
    return <div style={{ padding: '12px 16px' }}><span style={{ fontFamily: 'monospace', fontSize: '14px', color: 'var(--text)' }}>{text}</span></div>;
  }
  if (result.type === 'table') return <TableRenderer key={queryId.value} result={result as any} />;
  if (result.type === 'dict' || result.type === 'keyedTable') {
    const keys = result.keys as QueryResult | undefined;
    const vals = result.values as QueryResult | undefined;
    if (keys?.type === 'table' && vals?.type === 'table') {
      const keyCols = (keys.columns as Array<{name: string; type: string}>) ?? [];
      const valCols = (vals.columns as Array<{name: string; type: string}>) ?? [];
      const keyRows = (keys.rows as unknown[][]) ?? [];
      const valRows = (vals.rows as unknown[][]) ?? [];
      const rowCount = Math.min(keyRows.length, valRows.length);
      const mergedCols = keyCols.concat(valCols).map((c, i) => ({ ...c, isKey: i < keyCols.length }));
      const mergedRows: unknown[][] = [];
      for (let r = 0; r < rowCount; r++) mergedRows.push([...(keyRows[r] ?? []), ...(valRows[r] ?? [])]);
      return <TableRenderer key={queryId.value} result={{ type: 'table', columns: mergedCols, rows: mergedRows, rowCount } as any} />;
    }
    return <DictRenderer key={queryId.value} result={result as any} />;
  }
  if (result.type === 'list') return <ListRenderer key={queryId.value} result={result as any} />;
  return <pre style={{ margin: 0, padding: '12px 16px', color: 'var(--text)', fontSize: '13px', fontFamily: 'monospace' }}>{JSON.stringify(result, null, 2)}</pre>;
}

function tabStyle(active: boolean) {
  return {
    padding: '4px 12px', background: active ? 'var(--bg)' : 'transparent',
    color: active ? 'var(--text-bright)' : 'var(--text-secondary)', border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', outline: 'none',
  };
}
