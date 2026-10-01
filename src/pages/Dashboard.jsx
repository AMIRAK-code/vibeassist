import React from 'react';
import { DollarSign, Download, TrendingUp, Users } from 'lucide-react';
import { ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const data = [
  { name: '1st', revenue: 4000, profit: 2400, adSpend: 1000, organicDownloads: 1200, paidDownloads: 1200 },
  { name: '3rd', revenue: 3000, profit: 1398, adSpend: 1100, organicDownloads: 800, paidDownloads: 598 },
  { name: '5th', revenue: 2000, profit: 980, adSpend: 800, organicDownloads: 500, paidDownloads: 480 },
  { name: '7th', revenue: 2780, profit: 1908, adSpend: 1200, organicDownloads: 2000, paidDownloads: 1908 },
  { name: '9th', revenue: 3890, profit: 2800, adSpend: 1500, organicDownloads: 2400, paidDownloads: 2400 },
  { name: '11th', revenue: 4390, profit: 3800, adSpend: 1400, organicDownloads: 2100, paidDownloads: 1700 },
  { name: '13th', revenue: 5490, profit: 4300, adSpend: 1800, organicDownloads: 2800, paidDownloads: 1500 },
  { name: '15th', revenue: 4800, profit: 3900, adSpend: 1600, organicDownloads: 2500, paidDownloads: 1300 },
  { name: '17th', revenue: 6200, profit: 5100, adSpend: 2000, organicDownloads: 3200, paidDownloads: 1800 },
  { name: '19th', revenue: 7400, profit: 6000, adSpend: 2200, organicDownloads: 3500, paidDownloads: 2000 },
  { name: '21st', revenue: 8100, profit: 6800, adSpend: 2400, organicDownloads: 4000, paidDownloads: 2300 },
  { name: '23rd', revenue: 7800, profit: 6200, adSpend: 2100, organicDownloads: 3800, paidDownloads: 2100 },
  { name: '25th', revenue: 9200, profit: 7500, adSpend: 2600, organicDownloads: 4500, paidDownloads: 2600 },
  { name: '27th', revenue: 10500, profit: 8900, adSpend: 3000, organicDownloads: 5200, paidDownloads: 3100 },
];

const DOWNLOAD_KEYS = ['paidDownloads', 'organicDownloads'];

const revenueOf = (row) => row.revenue;
const downloadsOf = (row) => row.organicDownloads + row.paidDownloads;
const totalOf = (rows, valueOf) => rows.reduce((total, row) => total + valueOf(row), 0);

// Cards compare the second half of the period with the first half, so every
// number on this page comes from the same `data` the chart draws.
const half = Math.floor(data.length / 2);
const comparisonLabel = `vs. ${data[0].name}–${data[half - 1].name}`;
const growthOf = (valueOf) => {
  const before = totalOf(data.slice(0, half), valueOf);
  const after = totalOf(data.slice(half), valueOf);
  return ((after - before) / before) * 100;
};

const formatMoney = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const formatCount = (value) => new Intl.NumberFormat('en-US').format(value);
const formatCompactMoney = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(value);
const formatCompactCount = (value) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);
const formatGrowth = (percent) => `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
const growthColor = (percent) => (percent >= 0 ? '#2B75E8' : '#FF3B30');

const totalRevenue = totalOf(data, revenueOf);
const totalDownloads = totalOf(data, downloadsOf);
const revenueGrowth = growthOf(revenueOf);
const downloadsGrowth = growthOf(downloadsOf);

export default function Dashboard({ profile }) {
  const greeting = profile?.name ? `Welcome back, ${profile.name}. ` : '';

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-4">
        <div>
          <h2>Your <span className="text-gradient">Empire HUD</span></h2>
          <p className="input-label mt-4" style={{ marginTop: '4px' }}>{greeting}Overview of your vibes across all platforms.</p>
          {profile && (
            <p className="input-label" style={{ marginTop: '4px', fontSize: '0.8rem' }}>
              Monthly target: {profile.profitExpectancy}
              {profile.goals.length > 0 && ` · Goals: ${profile.goals.join(', ')}`}
            </p>
          )}
        </div>
        <button className="btn btn-primary">Refresh Data</button>
      </div>

      <div className="grid-4 mt-4">
        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Total Revenue</h4>
            <DollarSign className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '2rem' }}>{formatMoney(totalRevenue)}</h2>
          <p style={{ color: growthColor(revenueGrowth), fontSize: '0.8rem', marginTop: '8px', fontWeight: 'bold' }}>{formatGrowth(revenueGrowth)} {comparisonLabel}</p>
        </div>

        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Downloads</h4>
            <Download className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '2rem' }}>{formatCount(totalDownloads)}</h2>
          <p style={{ color: growthColor(downloadsGrowth), fontSize: '0.8rem', marginTop: '8px', fontWeight: 'bold' }}>{formatGrowth(downloadsGrowth)} {comparisonLabel}</p>
        </div>

        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Conversion Rate</h4>
            <TrendingUp className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '2rem' }}>4.8%</h2>
          <p style={{ color: '#FF3B30', fontSize: '0.8rem', marginTop: '8px', fontWeight: 'bold' }}>-0.4% from last week</p>
        </div>

        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Active Users</h4>
            <Users className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '2rem' }}>12,400</h2>
          <p style={{ color: '#2B75E8', fontSize: '0.8rem', marginTop: '8px', fontWeight: 'bold' }}>+18.1% from last week</p>
        </div>
      </div>

      <div className="glass-panel mt-4" style={{ height: '450px', padding: '32px', display: 'flex', flexDirection: 'column' }}>
        <h3 className="mb-4">Comprehensive Growth & Profit Analysis</h3>
        {/* The chart gets the space left under the heading, so it can't overflow the panel */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2B75E8" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#2B75E8" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8CB9F0" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#8CB9F0" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="name" stroke="#888" tick={{ fill: '#888' }} />
              {/* Dollars on the left axis, downloads on the right, so neither scale distorts the other */}
              <YAxis
                yAxisId="money"
                stroke="#888"
                tick={{ fill: '#888' }}
                tickFormatter={formatCompactMoney}
                label={{ value: 'Revenue & spend (USD)', angle: -90, position: 'insideLeft', fill: '#888', style: { textAnchor: 'middle' } }}
              />
              <YAxis
                yAxisId="downloads"
                orientation="right"
                stroke="#888"
                tick={{ fill: '#888' }}
                tickFormatter={formatCompactCount}
                label={{ value: 'Downloads', angle: 90, position: 'insideRight', fill: '#888', style: { textAnchor: 'middle' } }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#FAF9F6', borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                itemStyle={{ fontWeight: 'bold' }}
                formatter={(value, name, item) => (DOWNLOAD_KEYS.includes(item.dataKey) ? formatCount(value) : formatMoney(value))}
              />
              <Legend verticalAlign="top" height={36}/>
  
              {/* The multi-layered chart */}
              <Area yAxisId="money" type="monotone" dataKey="revenue" name="Gross Revenue" fill="url(#colorRevenue)" stroke="#8CB9F0" strokeWidth={2} />
              <Area yAxisId="money" type="monotone" dataKey="profit" name="Net Profit" fill="url(#colorProfit)" stroke="#2B75E8" strokeWidth={3} />
  
              <Bar yAxisId="downloads" dataKey="paidDownloads" name="Paid Acquisition" barSize={12} fill="#2B75E8" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="downloads" dataKey="organicDownloads" name="Organic Installs" barSize={12} fill="#FCC624" radius={[4, 4, 0, 0]} />
  
              <Line yAxisId="money" type="monotone" dataKey="adSpend" name="Ad Spend" stroke="#000" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
