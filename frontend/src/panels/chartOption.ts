/**
 * Pure ECharts option builder for mercury charts.
 *
 * No DOM, no signals — just (config, table data, isDark) → ECharts option, so it
 * can be exercised headlessly (see __tests__/chartOption.render.ts). Styling
 * follows the data-viz method: a validated categorical palette (fixed hue order,
 * stepped per theme), a single-hue sequential ramp for magnitude, recessive
 * hairline grid/axes, capped rounded bars, 2px round-cap lines, gradient area
 * washes, surface-ring markers, and tabular-number tooltips. Text always wears
 * ink tokens, never a series color.
 */

import type { ChartConfig } from '../store';
import { formatKdbInline } from '../renderers/kdbFormat';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Append an alpha byte to a #rrggbb hex. */
export const alpha = (hex: string, a: number) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

/** Compact axis-tick formatting: 1.2K / 3.4M / 5B. */
export function compactNum(v: any): string {
  if (typeof v !== 'number' || !isFinite(v)) return String(v);
  const a = Math.abs(v);
  const trim = (n: number, s: string) => (n.toFixed(1).replace(/\.0$/, '')) + s;
  if (a >= 1e9) return trim(v / 1e9, 'B');
  if (a >= 1e6) return trim(v / 1e6, 'M');
  if (a >= 1e3) return trim(v / 1e3, 'K');
  return Number.isInteger(v) ? v.toLocaleString('en-US') : String(v);
}

/** Full value formatting for tooltips: thousands-separated, up to 6 decimals. */
export function fmtVal(v: any): string {
  if (typeof v !== 'number' || !isFinite(v)) return String(v ?? '');
  return v.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

// Cartesian charts that support hold-and-drag area zoom.
export const ZOOMABLE = new Set(['line', 'bar', 'scatter', 'area', 'candlestick']);

/**
 * Build the ECharts option for a table `data` + chart `config`. Returns `null`
 * when the config can't produce a chart (missing columns, empty data).
 */
export function buildChartOption(config: ChartConfig, data: any, isDark: boolean): any {
  const cols = (data?.columns as Array<{ name: string }>) ?? [];
  const rows = (data?.rows as any[][]) ?? [];
  if (cols.length === 0 || rows.length === 0) return null;

  // Ink + surface tokens (aligned to marks-and-anatomy — recessive chrome, ink text)
  const ink = isDark
    ? { primary: '#e8e8e6', secondary: '#b7b6ad', muted: '#8a8a84', grid: '#2c2c2a', baseline: '#3a3a37', surface: '#1e1e1e', hairline: 'rgba(255,255,255,0.12)' }
    : { primary: '#1a1714', secondary: '#6e6860', muted: '#98918a', grid: '#ece8e1', baseline: '#d4cec4', surface: '#faf8f5', hairline: 'rgba(0,0,0,0.10)' };

  // Validated categorical palette — fixed hue order, stepped per theme.
  const palette = isDark
    ? ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926']
    : ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
  // Single-hue sequential ramp (blue), low→high. On dark the low step recedes toward the surface.
  const seqRamp = isDark
    ? ['#104281', '#1c5cab', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4']
    : ['#cde2fb', '#9ec5f4', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
  const color = (i: number) => palette[i % palette.length];

  const hasTitle = !!config.title;
  const titleOpt = hasTitle
    ? { text: config.title, left: 'center' as const, top: 8, textStyle: { color: ink.primary, fontSize: 14, fontWeight: 600, fontFamily: FONT } }
    : undefined;

  // Rotate + thin labels once the x-axis gets crowded so they stay legible.
  // `hideOverlap` drops any that still collide; `containLabel` reserves room.
  const rotateFor = (n: number) => (n > 60 ? 45 : n > 24 ? 30 : 0);
  const catAxis = (categories: any[]) => ({
    type: 'category' as const,
    data: categories,
    boundaryGap: true,
    axisLabel: {
      color: ink.muted, fontSize: 11, fontFamily: FONT, margin: 12,
      hideOverlap: true, interval: 'auto' as const, rotate: rotateFor(categories.length),
    },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: ink.baseline, width: 1 } },
  });
  const valAxis = (scale: boolean) => ({
    type: 'value' as const,
    scale,
    axisLabel: { color: ink.muted, fontSize: 11, fontFamily: FONT, margin: 12, formatter: (v: number) => compactNum(v) },
    splitLine: { lineStyle: { color: ink.grid, width: 1, type: 'solid' as const } },
    axisLine: { show: false },
    axisTick: { show: false },
  });

  const axisTip = (params: any) => {
    const arr = Array.isArray(params) ? params : [params];
    if (!arr.length) return '';
    const head = arr[0].axisValueLabel ?? arr[0].name ?? '';
    let body = '';
    for (const p of arr) {
      const raw = Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value;
      body += `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">`
        + `<span style="flex-shrink:0">${p.marker}</span>`
        + `<span style="color:${ink.secondary};max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.seriesName ?? ''}</span>`
        + `<span style="margin-left:auto;font-weight:600;color:${ink.primary};font-variant-numeric:tabular-nums">${fmtVal(raw)}</span>`
        + `</div>`;
    }
    return `<div style="font-family:${FONT};min-width:120px">`
      + `<div style="font-weight:600;color:${ink.primary};margin-bottom:2px">${head}</div>${body}</div>`;
  };

  const mkTooltip = (trigger: 'axis' | 'item', formatter?: any) => ({
    trigger,
    appendToBody: true,
    backgroundColor: ink.surface,
    borderColor: ink.hairline,
    borderWidth: 1,
    padding: [8, 12] as [number, number],
    textStyle: { color: ink.primary, fontSize: 12, fontFamily: FONT },
    extraCssText: `border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,${isDark ? 0.55 : 0.14});`,
    ...(trigger === 'axis'
      ? {
        axisPointer: {
          type: 'cross' as const,
          lineStyle: { color: ink.muted, width: 1, type: 'dashed' as const },
          crossStyle: { color: ink.muted, width: 1, type: 'dashed' as const },
          label: { backgroundColor: isDark ? '#333' : '#5a544c', color: '#fff', fontFamily: FONT, fontSize: 11, borderWidth: 0 },
        },
      }
      : {}),
    ...(formatter ? { formatter } : {}),
  });

  // Bottom chrome stack: zoom slider sits at the floor, legend above it.
  const layout = (hasLegend: boolean, withZoom = true) => {
    const sliderBottom = 8, sliderHeight = 16;
    const legendBottom = withZoom ? sliderBottom + sliderHeight + 8 : 8;
    const gridBottom = (hasLegend ? legendBottom + 20 : (withZoom ? sliderBottom + sliderHeight + 6 : 12));
    return {
      grid: { left: 16, right: 24, top: hasTitle ? 46 : 18, bottom: gridBottom, containLabel: true },
      legend: hasLegend
        ? {
          type: 'scroll' as const, bottom: legendBottom, left: 'center' as const,
          icon: 'roundRect', itemWidth: 14, itemHeight: 8, itemGap: 18,
          textStyle: { color: ink.secondary, fontSize: 11, fontFamily: FONT },
          inactiveColor: ink.muted, pageIconColor: ink.secondary, pageTextStyle: { color: ink.muted },
        }
        : undefined,
      dataZoom: withZoom
        ? [
          // Drag is reserved for area-zoom (takeGlobalCursor). Wheel/pinch zoom
          // is handled by our own listener in ChartPanel (ECharts' own wheel
          // handling misses trackpad pinch), so disable it here to avoid
          // double-zooming. The slider handles panning/range.
          { type: 'inside' as const, xAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseMove: false },
          {
            type: 'slider' as const, xAxisIndex: 0, bottom: sliderBottom, height: sliderHeight,
            borderColor: 'transparent',
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
            fillerColor: alpha(palette[0], isDark ? 0.20 : 0.12),
            dataBackground: { lineStyle: { color: ink.baseline, width: 1 }, areaStyle: { color: ink.grid } },
            selectedDataBackground: { lineStyle: { color: palette[0], width: 1 }, areaStyle: { color: alpha(palette[0], 0.18) } },
            handleStyle: { color: isDark ? '#4a4a4a' : '#ffffff', borderColor: ink.baseline, borderWidth: 1 },
            moveHandleStyle: { color: ink.baseline },
            emphasis: { handleStyle: { borderColor: palette[0] }, moveHandleStyle: { color: palette[0] } },
            textStyle: { color: ink.muted, fontSize: 10, fontFamily: FONT },
            brushSelect: false,
          },
        ]
        : undefined,
    };
  };

  const baseOption = {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT },
    color: palette,
    title: titleOpt,
    animationDuration: 600,
    animationDurationUpdate: 400,
    animationEasing: 'cubicOut' as const,
  };

  // Hidden toolbox that backs drag-to-zoom (activated via takeGlobalCursor in
  // the component). x-only so dragging a box zooms the selected range.
  const zoomToolbox = { show: false, feature: { dataZoom: { yAxisIndex: 'none', filterMode: 'none' } } };

  let option: any;
  const chartType = config.type;

  // ---- Pie chart ----
  if (chartType === 'pie') {
    const nameIdx = cols.findIndex(c => c.name === config.xColumn);
    const valIdx = cols.findIndex(c => c.name === config.yColumns[0]);
    if (nameIdx < 0 || valIdx < 0) return null;
    const pieData = rows.map(r => ({ name: formatKdbInline(r[nameIdx]), value: r[valIdx] }));
    option = {
      ...baseOption,
      tooltip: mkTooltip('item', (p: any) => `<div style="font-family:${FONT}">`
        + `<div style="font-weight:600;color:${ink.primary};margin-bottom:2px">${p.name}</div>`
        + `<div style="display:flex;align-items:center;gap:8px">${p.marker}`
        + `<span style="margin-left:auto;font-weight:600;color:${ink.primary};font-variant-numeric:tabular-nums">${fmtVal(p.value)}</span>`
        + `<span style="color:${ink.secondary}">(${p.percent}%)</span></div></div>`),
      legend: { type: 'scroll', bottom: 6, left: 'center', icon: 'roundRect', itemWidth: 14, itemHeight: 8, itemGap: 16, textStyle: { color: ink.secondary, fontSize: 11, fontFamily: FONT } },
      series: [{
        type: 'pie', data: pieData, radius: ['46%', '72%'], center: ['50%', '46%'],
        avoidLabelOverlap: true,
        label: { color: ink.secondary, fontSize: 11, fontFamily: FONT, formatter: '{b}  {d}%' },
        labelLine: { lineStyle: { color: ink.baseline }, length: 10, length2: 12, smooth: true },
        itemStyle: { borderColor: ink.surface, borderWidth: 2, borderRadius: 4 },
        emphasis: { label: { fontWeight: 600, color: ink.primary }, itemStyle: { shadowBlur: 14, shadowColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.18)' } },
      }],
    };
  }
  // ---- Candlestick (OHLC) ----
  else if (chartType === 'candlestick') {
    const xIdx = cols.findIndex(c => c.name === config.xColumn);
    if (xIdx < 0 || config.yColumns.length < 4) return null;
    const oIdx = cols.findIndex(c => c.name === config.yColumns[0]);
    const hIdx = cols.findIndex(c => c.name === config.yColumns[1]);
    const lIdx = cols.findIndex(c => c.name === config.yColumns[2]);
    const cIdx = cols.findIndex(c => c.name === config.yColumns[3]);
    if (oIdx < 0 || hIdx < 0 || lIdx < 0 || cIdx < 0) return null;
    const ohlcData = rows.map(r => [r[oIdx], r[hIdx], r[lIdx], r[cIdx]]);
    const up = isDark ? '#199e70' : '#1baf7a';
    const down = isDark ? '#e66767' : '#e34948';
    const lay = layout(false);
    option = {
      ...baseOption,
      toolbox: zoomToolbox,
      tooltip: mkTooltip('axis'),
      grid: lay.grid,
      dataZoom: lay.dataZoom,
      xAxis: catAxis(rows.map(r => formatKdbInline(r[xIdx]))),
      yAxis: valAxis(true),
      series: [{
        type: 'candlestick', data: ohlcData,
        barMaxWidth: 16,
        itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down, borderWidth: 1 },
      }],
    };
  }
  // ---- Heatmap ----
  else if (chartType === 'heatmap') {
    const xIdx = cols.findIndex(c => c.name === config.xColumn);
    const valIdx = cols.findIndex(c => c.name === config.yColumns[0]);
    if (xIdx < 0 || valIdx < 0) return null;
    const yGroupIdx = (config.groupBy ?? []).length > 0
      ? cols.findIndex(c => c.name === config.groupBy![0]) : -1;
    const xCategories = [...new Set(rows.map(r => formatKdbInline(r[xIdx])))];
    const yCategories = yGroupIdx >= 0
      ? [...new Set(rows.map(r => formatKdbInline(r[yGroupIdx])))]
      : rows.map((_, i) => String(i));
    const hmData = rows.map(r => {
      const x = formatKdbInline(r[xIdx]);
      const y = yGroupIdx >= 0 ? formatKdbInline(r[yGroupIdx]) : String(0);
      return [xCategories.indexOf(x), yCategories.indexOf(y), r[valIdx]];
    });
    // Loop rather than Math.min(...vals) — spreading 50K args can overflow the stack.
    let vMin = Infinity, vMax = -Infinity;
    for (const r of rows) {
      const v = r[valIdx];
      if (typeof v === 'number') { if (v < vMin) vMin = v; if (v > vMax) vMax = v; }
    }
    if (!isFinite(vMin)) { vMin = 0; vMax = 1; }
    option = {
      ...baseOption,
      tooltip: mkTooltip('item', (p: any) => `<div style="font-family:${FONT}">`
        + `<div style="color:${ink.secondary};margin-bottom:2px">${xCategories[p.value?.[0]]} · ${yCategories[p.value?.[1]]}</div>`
        + `<div style="font-weight:600;color:${ink.primary};font-variant-numeric:tabular-nums">${fmtVal(p.value?.[2])}</div></div>`),
      grid: { left: 16, right: 24, top: hasTitle ? 46 : 18, bottom: 56, containLabel: true },
      xAxis: { ...catAxis(xCategories), splitArea: { show: false } },
      yAxis: { type: 'category', data: yCategories, axisLabel: { color: ink.muted, fontSize: 11, fontFamily: FONT, margin: 12 }, axisTick: { show: false }, axisLine: { show: false }, splitArea: { show: false } },
      visualMap: {
        min: vMin, max: vMax, calculable: true, orient: 'horizontal', left: 'center', bottom: 8,
        itemWidth: 14, itemHeight: 120, textStyle: { color: ink.muted, fontSize: 10, fontFamily: FONT },
        inRange: { color: seqRamp },
      },
      series: [{
        type: 'heatmap', data: hmData, label: { show: false },
        itemStyle: { borderColor: ink.surface, borderWidth: 2, borderRadius: 2 },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)' } },
      }],
    };
  }
  // ---- Standard charts (line, bar, scatter, area) ----
  else {
    const xIdx = cols.findIndex(c => c.name === config.xColumn);
    if (xIdx < 0) return null;

    const isBar = config.type === 'bar';
    const isArea = config.type === 'area';
    const isLine = config.type === 'line';
    const isScatter = config.type === 'scatter';
    const stackMode = !!config.stack && (isBar || isArea);

    // Build one series object with shared, spec-compliant marks.
    // NB: "area" is not an ECharts series type — it's a line with an areaStyle.
    const seriesType = isArea ? 'line' : config.type;
    const makeSeries = (name: string, seriesData: any[], ci: number, dense: boolean) => {
      const c = color(ci);
      const s: any = { name, type: seriesType, data: seriesData, emphasis: { focus: 'series' } };
      if (isLine || isArea) {
        s.smooth = 0.35;
        s.smoothMonotone = 'x';
        s.showSymbol = !dense;
        s.symbol = 'circle';
        s.symbolSize = 7;
        s.lineStyle = { width: 2, cap: 'round', join: 'round' };
        s.itemStyle = { color: c, borderColor: ink.surface, borderWidth: 2 };
        // Largest-triangle-three-buckets downsampling — keeps the visual shape
        // with far fewer marks when the x-axis is dense.
        if (dense) s.sampling = 'lttb';
      }
      if ((isBar || isScatter) && dense) {
        s.large = true;
        s.largeThreshold = 2000;
      }
      if (isArea) {
        s.areaStyle = stackMode
          ? { opacity: 0.85, color: c }
          : { opacity: 1, color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(c, 0.30) }, { offset: 1, color: alpha(c, 0.02) }] } };
        if (stackMode) s.stack = 'total';
      }
      if (isLine && stackMode) s.stack = 'total';
      if (isBar) {
        s.barMaxWidth = 28;
        s.itemStyle = {
          color: c,
          borderRadius: stackMode ? 0 : [3, 3, 0, 0],
          borderColor: stackMode ? ink.surface : 'transparent',
          borderWidth: stackMode ? 1.5 : 0,
        };
        if (stackMode) s.stack = 'total';
      }
      if (isScatter) {
        s.symbolSize = 9;
        s.itemStyle = { color: alpha(c, 0.78), borderColor: ink.surface, borderWidth: 1 };
      }
      return s;
    };

    const groupByIdxs = (config.groupBy ?? [])
      .map(g => cols.findIndex(c => c.name === g))
      .filter(i => i >= 0);

    const cleanLabel = (key: string) => key.replace(/\|/g, ' / ');

    let series: any[];
    let xData: any[];

    if (groupByIdxs.length > 0) {
      const groups = new Map<string, any[][]>();
      for (const row of rows) {
        const key = groupByIdxs.map(i => formatKdbInline(row[i])).join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }
      // Unique X values in first-seen order
      const seenX = new Set<string>();
      xData = [];
      for (const row of rows) {
        const xVal = formatKdbInline(row[xIdx]);
        if (!seenX.has(xVal)) { seenX.add(xVal); xData.push(xVal); }
      }
      const dense = xData.length > 60;
      series = [];
      let ci = 0;
      for (const [groupKey, groupRows] of groups) {
        for (const yCol of config.yColumns) {
          const yIdx = cols.findIndex(c => c.name === yCol);
          if (yIdx < 0) continue;
          const label = config.yColumns.length > 1 ? yCol + ' · ' + cleanLabel(groupKey) : cleanLabel(groupKey);
          series.push(makeSeries(label, groupRows.map(r => [formatKdbInline(r[xIdx]), r[yIdx]]), ci, dense));
          ci++;
        }
      }
    } else {
      xData = rows.map(r => formatKdbInline(r[xIdx]));
      const dense = rows.length > 60;
      series = config.yColumns.map((yCol, ci) => {
        const yIdx = cols.findIndex(c => c.name === yCol);
        if (yIdx < 0) return null;
        const seriesData = (isScatter)
          ? rows.map(r => [formatKdbInline(r[xIdx]), r[yIdx]])
          : rows.map(r => r[yIdx]);
        return makeSeries(yCol, seriesData, ci, dense);
      }).filter(Boolean) as any[];
    }

    const hasLegend = series.length > 1;
    const lay = layout(hasLegend);
    option = {
      ...baseOption,
      toolbox: zoomToolbox,
      tooltip: mkTooltip('axis', axisTip),
      legend: lay.legend,
      grid: lay.grid,
      dataZoom: lay.dataZoom,
      xAxis: catAxis(xData),
      yAxis: valAxis(isLine || isArea || isScatter),
      series,
    };
    if (isBar) option.barCategoryGap = '32%';
  }

  return option;
}
