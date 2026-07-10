/**
 * Headless render check for buildChartOption.
 *
 * Feeds every chart type + config permutation through the REAL option builder
 * and ECharts (same component registration as the app, SVG/SSR renderer), then
 * renders each to an SVG string. A malformed option throws here, so this catches
 * option-shape regressions without a browser.
 *
 * Run:
 *   node_modules/.bin/esbuild src/__tests__/chartOption.render.ts \
 *     --bundle --format=esm --platform=node --outfile=/tmp/chart_ssr_test.mjs \
 *   && node /tmp/chart_ssr_test.mjs
 */

import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart, CandlestickChart, HeatmapChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, ToolboxComponent, VisualMapComponent, TitleComponent, MarkLineComponent } from 'echarts/components';
import { LegacyGridContainLabel } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
import { buildChartOption } from '../panels/chartOption';
import type { ChartConfig } from '../store';

// This is a Node-run script (bundled via esbuild), not part of the app build.
declare const process: { exit(code: number): void };

echarts.use([
  LineChart, BarChart, ScatterChart, CandlestickChart, HeatmapChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent,
  ToolboxComponent, VisualMapComponent, TitleComponent, MarkLineComponent,
  LegacyGridContainLabel, SVGRenderer,
]);

const col = (name: string, type: string) => ({ name, type });

// ~120 rows so the "dense" (>60) sampling/large branches are exercised.
function sampleTable(n = 120) {
  const syms = ['AAPL', 'MSFT', 'GOOG'];
  const columns = [
    col('time', 'symbol'), col('sym', 'symbol'),
    col('price', 'float'), col('size', 'long'),
    col('open', 'float'), col('high', 'float'), col('low', 'float'), col('close', 'float'),
    col('val', 'float'),
  ];
  const rows: any[][] = [];
  for (let i = 0; i < n; i++) {
    const sym = syms[i % syms.length];
    const o = 100 + (i % 20) - 10;
    const h = o + 3, l = o - 4, c = o + ((i % 5) - 2);
    rows.push([
      `09:${String(30 + (i % 30)).padStart(2, '0')}`, sym,
      +(o + Math.sin(i / 5) * 2).toFixed(2), 100 + (i * 7) % 900,
      o, h, l, c, (i % 13) + (sym === 'AAPL' ? 2 : 0),
    ]);
  }
  return { type: 'table', columns, rows, rowCount: n };
}

const data = sampleTable();
const cases: Array<{ name: string; cfg: ChartConfig; dark?: boolean }> = [
  { name: 'line single (dense)', cfg: { type: 'line', xColumn: 'time', yColumns: ['price'] } },
  { name: 'line grouped', cfg: { type: 'line', xColumn: 'time', yColumns: ['price'], groupBy: ['sym'] } },
  { name: 'line grouped multi-y', cfg: { type: 'line', xColumn: 'time', yColumns: ['price', 'val'], groupBy: ['sym'] } },
  { name: 'line + title', cfg: { type: 'line', xColumn: 'time', yColumns: ['price'], title: 'Prices' } },
  { name: 'bar', cfg: { type: 'bar', xColumn: 'sym', yColumns: ['size'] } },
  { name: 'bar stacked grouped', cfg: { type: 'bar', xColumn: 'time', yColumns: ['size'], groupBy: ['sym'], stack: true } },
  { name: 'area', cfg: { type: 'area', xColumn: 'time', yColumns: ['price'], groupBy: ['sym'] } },
  { name: 'area stacked', cfg: { type: 'area', xColumn: 'time', yColumns: ['price'], groupBy: ['sym'], stack: true } },
  { name: 'scatter', cfg: { type: 'scatter', xColumn: 'price', yColumns: ['size'] } },
  { name: 'candlestick', cfg: { type: 'candlestick', xColumn: 'time', yColumns: ['open', 'high', 'low', 'close'] } },
  { name: 'heatmap', cfg: { type: 'heatmap', xColumn: 'time', yColumns: ['val'], groupBy: ['sym'] } },
  { name: 'pie', cfg: { type: 'pie', xColumn: 'sym', yColumns: ['size'] } },
  { name: 'line dark', dark: true, cfg: { type: 'line', xColumn: 'time', yColumns: ['price'], groupBy: ['sym'] } },
  { name: 'bar dark', dark: true, cfg: { type: 'bar', xColumn: 'sym', yColumns: ['size'] } },
];

let pass = 0, fail = 0;
for (const { name, cfg, dark } of cases) {
  try {
    const option = buildChartOption(cfg, data, !!dark);
    if (!option) { console.error(`FAIL  ${name}: builder returned null`); fail++; continue; }
    const chart = echarts.init(null as any, null, { renderer: 'svg', ssr: true, width: 800, height: 480 });
    chart.setOption(option);
    const svg = chart.renderToSVGString();
    chart.dispose();
    if (!svg || svg.length < 200) { console.error(`FAIL  ${name}: empty SVG`); fail++; continue; }
    console.log(`PASS  ${name}  (svg ${svg.length}b, ${(option.series?.length ?? 0)} series)`);
    pass++;
  } catch (e: any) {
    console.error(`FAIL  ${name}: ${e?.message || e}`);
    fail++;
  }
}

// Guard cases — builder must reject unrenderable configs, not throw.
const guards: Array<{ name: string; cfg: ChartConfig; data: any }> = [
  { name: 'empty rows', cfg: { type: 'line', xColumn: 'time', yColumns: ['price'] }, data: { type: 'table', columns: data.columns, rows: [] } },
  { name: 'missing x col', cfg: { type: 'line', xColumn: 'nope', yColumns: ['price'] }, data },
  { name: 'candlestick <4 y', cfg: { type: 'candlestick', xColumn: 'time', yColumns: ['open'] }, data },
];
for (const g of guards) {
  const r = buildChartOption(g.cfg, g.data, false);
  if (r === null) { console.log(`PASS  guard: ${g.name} → null`); pass++; }
  else { console.error(`FAIL  guard: ${g.name} should be null`); fail++; }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
