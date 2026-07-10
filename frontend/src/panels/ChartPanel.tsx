/**
 * Chart panel — renders query results as ECharts visualizations.
 * Supports line, bar, scatter, area, candlestick, heatmap and pie with
 * multi-column grouping, hold-to-zoom, isolate-first legend filtering, and
 * save/open/pop-out. The ECharts option itself is built by the pure, testable
 * `buildChartOption` in ./chartOption.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart, CandlestickChart, HeatmapChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, ToolboxComponent, VisualMapComponent, TitleComponent, MarkLineComponent } from 'echarts/components';
import { LegacyGridContainLabel } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts } from 'echarts/core';
import type { ChartConfig } from '../store';

// Register ECharts components for tree-shaking.
// LegacyGridContainLabel is required in ECharts 6 for `grid.containLabel` (which
// reserves room for rotated/long axis labels) to take effect.
echarts.use([
  LineChart, BarChart, ScatterChart, CandlestickChart, HeatmapChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent,
  ToolboxComponent, VisualMapComponent, TitleComponent, MarkLineComponent,
  LegacyGridContainLabel, CanvasRenderer,
]);
import { theme, popOutChart } from '../store';
import { buildChartOption, FONT, ZOOMABLE } from './chartOption';

interface Props {
  data: any;
  config: ChartConfig;
  needsRender: boolean;
  onUpdateConfig: (config: ChartConfig) => void;
  onRendered: () => void;
}

const CHART_TYPES = ['line', 'bar', 'scatter', 'area', 'candlestick', 'heatmap', 'pie'] as const;

export function ChartPanel({ data, config, needsRender, onUpdateConfig, onRendered }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ECharts | null>(null);
  const [rendered, setRendered] = useState(false);
  const [saveUrl, setSaveUrl] = useState<string | null>(null);

  // Init chart instance — re-create when theme changes
  useEffect(() => {
    if (!chartRef.current) return;
    if (instanceRef.current) { instanceRef.current.dispose(); instanceRef.current = null; }
    const inst = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    instanceRef.current = inst;
    setRendered(false);

    // Isolate-first legend: from the all-shown state, clicking a group shows
    // only that group; further clicks add groups; emptying it reverts to all.
    inst.on('legendselectchanged', (params: any) => {
      const sel: Record<string, boolean> = params.selected ?? {};
      const names = Object.keys(sel);
      if (names.length === 0) return;
      const clicked = params.name;
      // ECharts already applied the toggle — reconstruct the pre-click state.
      const prev: Record<string, boolean> = { ...sel, [clicked]: !sel[clicked] };
      const prevAllShown = names.every(n => prev[n]);
      let target: Record<string, boolean>;
      if (prevAllShown) {
        target = {};
        names.forEach(n => { target[n] = n === clicked; });
      } else {
        target = { ...sel };
        if (names.every(n => !target[n])) names.forEach(n => { target[n] = true; });
      }
      // setOption (not dispatchAction) doesn't re-fire this event → no recursion.
      inst.setOption({ legend: { selected: target } });
    });

    // Wheel + trackpad-pinch zoom, centered on the cursor. We handle this
    // ourselves (rather than ECharts' zoomOnMouseWheel) because a Mac pinch is a
    // ctrl+wheel event that the browser would otherwise consume as page-zoom;
    // preventDefault here keeps the gesture on the chart.
    const onWheel = (e: WheelEvent) => {
      const chart = instanceRef.current;
      if (!chart) return;
      const opt: any = chart.getOption();
      const zooms = opt.dataZoom;
      if (!zooms || !zooms.length) return; // pie/other — no zoom axis
      e.preventDefault();
      const inside = zooms.find((d: any) => d.type === 'inside') || zooms[0];
      const start = inside.start ?? 0;
      const end = inside.end ?? 100;
      const span = Math.max(0.5, end - start);
      const xData = opt.xAxis?.[0]?.data;
      const len = Array.isArray(xData) ? xData.length : 0;
      const rect = chartRef.current!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // Anchor the zoom on the data point under the cursor (fraction of full range).
      let anchorPct = (start + end) / 2;
      const idx: any = chart.convertFromPixel({ xAxisIndex: 0 }, [px, py]);
      const ix = Array.isArray(idx) ? idx[0] : idx;
      if (typeof ix === 'number' && isFinite(ix) && len > 1) {
        anchorPct = Math.max(0, Math.min(1, ix / (len - 1))) * 100;
      }
      const factor = e.deltaY < 0 ? 0.8 : 1.25; // pinch-out / scroll-up → zoom in
      const newSpan = Math.max(1, Math.min(100, span * factor));
      const rel = (anchorPct - start) / span;      // cursor's position within the window
      let newStart = anchorPct - rel * newSpan;     // keep it stationary
      let newEnd = newStart + newSpan;
      if (newStart < 0) { newEnd -= newStart; newStart = 0; }
      if (newEnd > 100) { newStart -= (newEnd - 100); newEnd = 100; }
      newStart = Math.max(0, newStart);
      newEnd = Math.min(100, newEnd);
      chart.dispatchAction({ type: 'dataZoom', start: newStart, end: newEnd });
    };
    chartRef.current.addEventListener('wheel', onWheel, { passive: false });

    // ResizeObserver handles split-drag, sidebar toggle, and window resize
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(chartRef.current);
    const chartEl = chartRef.current;
    return () => {
      chartEl.removeEventListener('wheel', onWheel);
      ro.disconnect();
      inst.dispose();
      instanceRef.current = null;
    };
  }, [theme.value]);

  const doRender = () => {
    const inst = instanceRef.current;
    if (!inst || !data) return;
    const option = buildChartOption(config, data, theme.value === 'dark');
    if (!option) return;
    // notMerge: a config change fully replaces the chart (and resets zoom) —
    // this is also what the Reset button relies on to "zoom out + re-preset".
    inst.setOption(option, true);
    // Enable drag-to-zoom: hold and drag over a section of a cartesian chart to
    // zoom into that range. Re-armed after every render (setOption clears it).
    if (ZOOMABLE.has(config.type)) {
      inst.dispatchAction({ type: 'takeGlobalCursor', key: 'dataZoomSelect', dataZoomSelectActive: true });
    }
    setRendered(true);
    onRendered();
  };

  // Auto-render if needsRender flag is set externally
  useEffect(() => {
    if (needsRender && data && instanceRef.current) doRender();
  }, [needsRender, data]);

  const getDataUrl = () => {
    const inst = instanceRef.current;
    if (!inst) return null;
    const bg = theme.value === 'dark' ? '#1e1e1e' : '#faf8f5';
    return inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bg });
  };

  const handleSave = () => {
    const url = getDataUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = (config.title || 'chart') + '.png';
    a.click();
  };

  const handleViewFull = () => {
    const url = getDataUrl();
    if (url) setSaveUrl(url);
  };

  const handleOpenInTab = () => {
    const dataUrl = getDataUrl();
    if (!dataUrl) return;
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)![1];
    const bytes = atob(parts[1]);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    const blob = new Blob([buf], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  };

  const cols = (data?.columns as Array<{ name: string; type: string }>) ?? [];
  const numericCols = cols.filter(c => ['long','int','short','float','real','byte'].includes(c.type));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Fullscreen overlay */}
      {saveUrl && (
        <div onClick={() => setSaveUrl(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
          <img src={saveUrl} style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain' }}
            onClick={e => e.stopPropagation()} />
          <div style={{ position: 'absolute', top: '12px', right: '16px', color: 'var(--text-bright)', fontSize: '24px', cursor: 'pointer' }}
            onClick={() => setSaveUrl(null)}>✕</div>
          <div style={{ position: 'absolute', bottom: '12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Right-click → Save Image to download · Click outside to close
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{
        display: 'flex', gap: '4px', padding: '3px 8px', background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap',
        alignItems: 'center', fontSize: '10px', minHeight: '28px',
      }}>
        <select value={config.type} onChange={e => onUpdateConfig({ ...config, type: (e.target as HTMLSelectElement).value as any })}
          style={selStyle}>{CHART_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>

        <span style={{ color: 'var(--text-secondary)' }}>X:</span>
        <select value={config.xColumn} onChange={e => onUpdateConfig({ ...config, xColumn: (e.target as HTMLSelectElement).value })}
          style={selStyle}>{cols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select>

        <span style={{ color: 'var(--text-secondary)' }}>Y:</span>
        {numericCols.slice(0, 4).map(nc => {
          const checked = config.yColumns.includes(nc.name);
          return (
            <label key={nc.name} style={{ color: 'var(--text-bright)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={checked} onChange={() => {
                let next: string[];
                if (checked) {
                  next = config.yColumns.filter(y => y !== nc.name);
                } else if (config.yAuto) {
                  // First explicit pick replaces the auto-detected default instead of
                  // stacking onto it — so switching to another measure just switches.
                  next = [nc.name];
                } else {
                  next = [...config.yColumns, nc.name];
                }
                // Never leave zero measures selected; mark the selection user-owned.
                if (next.length > 0) onUpdateConfig({ ...config, yColumns: next, yAuto: false });
              }} style={{ margin: 0 }} />
              {nc.name}
            </label>
          );
        })}

        <span style={{ color: 'var(--text-secondary)' }}>Group:</span>
        {cols.slice(0, 5).map(c => {
          const checked = (config.groupBy ?? []).includes(c.name);
          return (
            <label key={c.name} style={{ color: 'var(--text-bright)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={checked} onChange={() => {
                const next = checked
                  ? (config.groupBy ?? []).filter(g => g !== c.name)
                  : [...(config.groupBy ?? []), c.name];
                onUpdateConfig({ ...config, groupBy: next.length > 0 ? next : undefined });
              }} style={{ margin: 0 }} />
              {c.name}
            </label>
          );
        })}

        {(config.type === 'bar' || config.type === 'area') && (
          <label style={{ color: 'var(--text-bright)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={!!config.stack} onChange={() => onUpdateConfig({ ...config, stack: !config.stack })}
              style={{ margin: 0 }} />
            Stack
          </label>
        )}

        <input placeholder="Title" value={config.title ?? ''}
          onInput={e => {
            const title = (e.target as HTMLInputElement).value || undefined;
            onUpdateConfig({ ...config, title });
            // Update title in-place so it changes/clears immediately without losing zoom
            instanceRef.current?.setOption({
              title: title
                ? { show: true, text: title, left: 'center', top: 8, textStyle: { color: theme.value === 'dark' ? '#e8e8e6' : '#1a1714', fontSize: 14, fontWeight: 600, fontFamily: FONT } }
                : { show: false },
            });
          }}
          style={{ ...inputStyle, width: '80px', marginLeft: 'auto' }} />

        {rendered && (
          <>
            <button onClick={handleSave} title="Save as PNG"
              style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-bright)' }}>
              💾 Save
            </button>
            <button onClick={handleOpenInTab} title="Open snapshot image in new tab"
              style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-bright)' }}>
              📄 Open
            </button>
            <button onClick={() => popOutChart(data, config)}
              title="Pop out an interactive copy — frozen to this result, unaffected by later queries"
              style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-bright)' }}>
              ⧉ Pop out
            </button>
            <button onClick={() => { doRender(); }}
              title="Reset view — re-render with the current axes/group and zoom out"
              style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-bright)' }}>
              ↺ Reset
            </button>
            <button onClick={handleViewFull} title="View full-size"
              style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-bright)' }}>
              🔍 View
            </button>
          </>
        )}
      </div>

      {/* Chart area */}
      <div style={{ flex: 1, minHeight: '200px', position: 'relative' }}>
        <div ref={chartRef} style={{ width: '100%', height: '100%', visibility: rendered ? 'visible' : 'hidden' }} />
        {!rendered && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '13px', pointerEvents: 'none' }}>
            Configure axes and columns above — chart renders automatically.
          </div>
        )}
      </div>
    </div>
  );
}

const selStyle: any = { background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid var(--border-strong)', padding: '2px 4px', borderRadius: '3px', fontSize: '11px', outline: 'none', maxWidth: '100px' };
const inputStyle: any = { background: 'var(--bg-input)', color: 'var(--text-bright)', border: '1px solid var(--border-strong)', padding: '2px 6px', borderRadius: '3px', fontSize: '11px', outline: 'none', fontFamily: 'inherit' };
const btnStyle: any = { border: '1px solid var(--border-strong)', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', padding: '3px 8px', fontFamily: 'inherit' };
