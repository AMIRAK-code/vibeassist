import React from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDay } from '../lib/metrics';
import { formatCompactCount, formatCompactMoney, formatCount, formatMoney } from '../lib/format';
import { CHART_CHROME, SERIES_COLORS } from '../lib/chartColors';

const tick = { fill: CHART_CHROME.axis, fontSize: 12 };
const Y_WIDTH = 60; // same on both panels so the days line up

// Hover readout: the value leads, the series name follows, keyed with a short stroke
export function ChartReadout({ active, payload, rows }) {
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-day">{formatDay(day.day, true)}</p>
      {rows.map((row) => (
        <p key={row.key} className="chart-tooltip-row">
          <span className="chart-key" style={{ background: row.color }} aria-hidden="true" />
          <strong>{row.format(day[row.key])}</strong> {row.label}
        </p>
      ))}
    </div>
  );
}

export function ChartLegend({ items }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.key}>
          <span className={`chart-swatch chart-swatch--${item.mark}`} style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

// "Comprehensive Growth & Profit Analysis": money and downloads for the same days, one above
// the other. Two aligned panels instead of two scales on one plot, so the lines never appear
// to meet or cross only because of where an axis happens to start.
export default function GrowthChart({ data, currency }) {
  const money = (v) => formatMoney(v, currency);
  const moneyRows = [
    { key: 'revenue', label: 'Gross revenue', color: SERIES_COLORS.revenue, format: money, mark: 'area' },
    { key: 'profit', label: 'Net profit', color: SERIES_COLORS.profit, format: money, mark: 'area' },
    { key: 'adSpend', label: 'Ad spend', color: SERIES_COLORS.adSpend, format: money, mark: 'line' },
  ];
  const downloadRows = [
    { key: 'organicDownloads', label: 'Organic installs', color: SERIES_COLORS.organicDownloads, format: formatCount, mark: 'bar' },
    { key: 'paidDownloads', label: 'Paid acquisition', color: SERIES_COLORS.paidDownloads, format: formatCount, mark: 'bar' },
  ];
  const activeDot = (color) => ({ r: 4, fill: color, stroke: CHART_CHROME.surface, strokeWidth: 2 });

  return (
    <div className="growth-chart">
      <div className="growth-panel">
        <div className="growth-panel-head">
          <h3>Revenue, profit and ad spend <span className="muted">({currency})</span></h3>
          <ChartLegend items={moneyRows} />
        </div>
        <div style={{ height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} syncId="growth" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} />
              <XAxis dataKey="label" hide />
              <YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompactMoney(v, currency)} width={Y_WIDTH} />
              <Tooltip content={<ChartReadout rows={moneyRows} />} cursor={{ stroke: CHART_CHROME.axis, strokeWidth: 1 }} isAnimationActive={false} />
              <Area type="monotone" dataKey="revenue" stroke={SERIES_COLORS.revenue} strokeWidth={2} fill={SERIES_COLORS.revenue} fillOpacity={0.1} activeDot={activeDot(SERIES_COLORS.revenue)} />
              <Area type="monotone" dataKey="profit" stroke={SERIES_COLORS.profit} strokeWidth={2} fill={SERIES_COLORS.profit} fillOpacity={0.1} activeDot={activeDot(SERIES_COLORS.profit)} />
              <Line type="monotone" dataKey="adSpend" stroke={SERIES_COLORS.adSpend} strokeWidth={2} dot={false} activeDot={activeDot(SERIES_COLORS.adSpend)} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="growth-panel">
        <div className="growth-panel-head">
          <h3>Downloads</h3>
          <ChartLegend items={downloadRows} />
        </div>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} syncId="growth" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} />
              <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: CHART_CHROME.baseline }} minTickGap={18} />
              <YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={formatCompactCount} width={Y_WIDTH} allowDecimals={false} />
              <Tooltip content={<ChartReadout rows={downloadRows} />} cursor={{ fill: 'rgba(36,72,255,0.06)' }} isAnimationActive={false} />
              {/* A thin surface-coloured edge keeps the two stacked parts visibly apart */}
              <Bar dataKey="organicDownloads" stackId="d" fill={SERIES_COLORS.organicDownloads} stroke={CHART_CHROME.surface} strokeWidth={1} maxBarSize={24} />
              <Bar dataKey="paidDownloads" stackId="d" fill={SERIES_COLORS.paidDownloads} stroke={CHART_CHROME.surface} strokeWidth={1} maxBarSize={24} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
