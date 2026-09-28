import React from 'react';
import { DollarSign, Download, Activity, TrendingUp, Users } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Mon', revenue: 4000, downloads: 2400 },
  { name: 'Tue', revenue: 3000, downloads: 1398 },
  { name: 'Wed', revenue: 2000, downloads: 9800 },
  { name: 'Thu', revenue: 2780, downloads: 3908 },
  { name: 'Fri', revenue: 1890, downloads: 4800 },
  { name: 'Sat', revenue: 2390, downloads: 3800 },
  { name: 'Sun', revenue: 3490, downloads: 4300 },
];

export default function Dashboard() {
  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-4">
        <div>
          <h2>Your <span className="text-gradient">Empire HUD</span></h2>
          <p className="input-label mt-4" style={{ marginTop: '4px' }}>Overview of your vibes across all platforms.</p>
        </div>
        <button className="btn btn-primary">Refresh Data</button>
      </div>

      <div className="grid-4 mt-4">
        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Total Revenue</h4>
            <DollarSign className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '2rem' }}>$19,550</h2>
          <p style={{ color: '#00d2ff', fontSize: '0.8rem', marginTop: '8px' }}>+12.5% from last week</p>
        </div>

        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Downloads</h4>
            <Download className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '2rem' }}>30,288</h2>
          <p style={{ color: '#00d2ff', fontSize: '0.8rem', marginTop: '8px' }}>+5.2% from last week</p>
        </div>

        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Conversion Rate</h4>
            <TrendingUp className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '2rem' }}>4.8%</h2>
          <p style={{ color: '#ff2e93', fontSize: '0.8rem', marginTop: '8px' }}>-0.4% from last week</p>
        </div>

        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Active Users</h4>
            <Users className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '2rem' }}>12,400</h2>
          <p style={{ color: '#00d2ff', fontSize: '0.8rem', marginTop: '8px' }}>+18.1% from last week</p>
        </div>
      </div>

      <div className="glass-panel mt-4" style={{ height: '400px' }}>
        <h3 className="mb-4">Revenue & Downloads Chart</h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff2e93" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#ff2e93" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorDownloads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#00f0ff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" />
            <YAxis stroke="rgba(255,255,255,0.5)" />
            <Tooltip contentStyle={{ backgroundColor: '#050508', border: '1px solid rgba(255,255,255,0.1)' }} />
            <Area type="monotone" dataKey="revenue" stroke="#ff2e93" fillOpacity={1} fill="url(#colorRevenue)" />
            <Area type="monotone" dataKey="downloads" stroke="#00f0ff" fillOpacity={1} fill="url(#colorDownloads)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
