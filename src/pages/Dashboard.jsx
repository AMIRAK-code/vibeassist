import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, DollarSign, Download, Plug } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PageHeader, Notice, SampleBadge } from "../components/UI";
import {
  sampleMetrics,
  summarizeMetrics,
  selectPeriod,
  formatMoney,
  formatCount,
  formatDate,
} from "../data/metrics";

export default function Dashboard({ project, onExploreSample }) {
  const [days, setDays] = useState(7);
  const [metric, setMetric] = useState("revenue");
  const rows = selectPeriod(sampleMetrics, days);
  const totals = summarizeMetrics(rows);
  const range = `${formatDate(rows[0].date)}–${formatDate(rows.at(-1).date)}, 2026`;
  const isRevenue = metric === "revenue";
  const title = isRevenue ? "Revenue" : "Downloads";
  const formatter = isRevenue ? formatMoney : formatCount;
  const hasSample = !project || project.mode === "sample";

  return (
    <div className="stack">
      <PageHeader
        title="Overview"
        description={
          project
            ? `A clearer view of ${project.name}.`
            : "Revenue and downloads, with room for your next step."
        }
      >
        {hasSample ? (
          <SampleBadge />
        ) : (
          <span className="badge">No data connected</span>
        )}
      </PageHeader>
      {!hasSample ? (
        <section className="glass-panel empty-state">
          <Plug size={32} aria-hidden="true" />
          <h2>Your project is ready. Your data comes next.</h2>
          <p>
            No sources are connected. Live integrations are not available in
            this preview. You can review the available sources or explore a
            separate sample dataset.
          </p>
          <div className="button-row">
            <Link className="btn btn-primary" to="/integrations">
              Review connections
            </Link>
            <button className="btn btn-secondary" onClick={onExploreSample}>
              Explore with sample data
            </button>
          </div>
        </section>
      ) : (
        <>
          <Notice>
            <strong>You’re exploring sample data.</strong> These figures
            illustrate the dashboard and are not your project’s results. No live
            source is connected.
          </Notice>
          <div className="flex-between">
            <h2 className="section-title">Performance</h2>
            <div className="period-control">
              <label htmlFor="metric-period">Sample period</label>
              <select
                id="metric-period"
                className="input-field"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                <option value={7}>Full week · Sep 21–27</option>
                <option value={3}>Last 3 days · Sep 25–27</option>
              </select>
            </div>
          </div>
          <div className="grid-2 metric-cards">
            {[
              {
                key: "revenue",
                label: "Revenue",
                icon: DollarSign,
                value: formatMoney(totals.revenue),
                unit: "USD · gross sample revenue",
              },
              {
                key: "downloads",
                label: "Downloads",
                icon: Download,
                value: formatCount(totals.downloads),
                unit: "Total sample downloads",
              },
            ].map(({ key, label, icon: Icon, value, unit }) => (
              <section
                className="glass-panel metric-card"
                key={key}
                aria-label={`${label} summary`}
              >
                <div className="flex-between">
                  <h3>{label}</h3>
                  <Icon size={20} aria-hidden="true" />
                </div>
                <p className="metric-value">{value}</p>
                <p className="muted">{unit}</p>
                <p className="metric-period">{range}</p>
              </section>
            ))}
          </div>
          <section
            className="glass-panel chart-panel"
            aria-labelledby="chart-title"
          >
            <div className="flex-between">
              <div>
                <h2 id="chart-title">{title} by day</h2>
                <p className="muted">
                  {range} · {isRevenue ? "US dollars (USD)" : "Download count"}
                </p>
              </div>
              <div
                className="segmented-control"
                role="group"
                aria-label="Chart metric"
              >
                <button
                  aria-pressed={isRevenue}
                  onClick={() => setMetric("revenue")}
                >
                  Revenue
                </button>
                <button
                  aria-pressed={!isRevenue}
                  onClick={() => setMetric("downloads")}
                >
                  Downloads
                </button>
              </div>
            </div>
            <p className="sr-only" aria-live="polite">
              {title}: {formatter(totals[metric])} for {range}. Daily values are
              available in the table below.
            </p>
            <div
              className="chart-plot"
              role="img"
              aria-label={`${title} by day for ${range}. See the daily data table for exact values.`}
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart
                  data={rows}
                  margin={{ top: 20, right: 8, bottom: 0, left: 0 }}
                  accessibilityLayer={false}
                >
                  <defs>
                    <linearGradient
                      id="metric-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={isRevenue ? "#ae1968" : "#006d80"}
                        stopOpacity={0.18}
                      />
                      <stop
                        offset="100%"
                        stopColor={isRevenue ? "#ae1968" : "#006d80"}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--panel-border)"
                    vertical={false}
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="day"
                    stroke="var(--text-secondary)"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    minTickGap={4}
                  />
                  <YAxis
                    stroke="var(--text-secondary)"
                    tickLine={false}
                    axisLine={false}
                    width={62}
                    tick={{ fontSize: 12 }}
                    tickFormatter={formatter}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #dcdce2",
                      borderRadius: 10,
                      color: "#20202b",
                    }}
                    labelStyle={{ color: "#20202b" }}
                    formatter={(value) => [formatter(value), title]}
                    labelFormatter={(_, payload) =>
                      payload?.[0] ? formatDate(payload[0].payload.date) : ""
                    }
                  />
                  <Area
                    type="linear"
                    dataKey={metric}
                    stroke={isRevenue ? "#ae1968" : "#006d80"}
                    strokeWidth={2.5}
                    fill="url(#metric-fill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <details className="data-details">
              <summary>View daily data</summary>
              <div
                className="table-scroll"
                role="region"
                aria-label="Daily performance data"
                tabIndex={0}
              >
                <table>
                  <caption>Sample performance · {range}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Revenue (USD)</th>
                      <th scope="col">Downloads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.date}>
                        <th scope="row">{formatDate(row.date)}</th>
                        <td>{formatMoney(row.revenue)}</td>
                        <td>{formatCount(row.downloads)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td>{formatMoney(totals.revenue)}</td>
                      <td>{formatCount(totals.downloads)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>
          </section>
        </>
      )}
      <section className="glass-panel next-action">
        <div>
          <span className="eyebrow">Your next step</span>
          <h2>
            {hasSample
              ? "Give your project a launch plan."
              : "Start with one source."}
          </h2>
          <p className="muted">
            {hasSample
              ? "Review platform resources and turn your launch into a manageable checklist."
              : "Choose the provider you would like to use when live connections become available."}
          </p>
        </div>
        <Link
          className="btn btn-secondary"
          to={hasSample ? "/publishing" : "/integrations"}
        >
          {hasSample ? "Open launch checklist" : "Choose a source"}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
