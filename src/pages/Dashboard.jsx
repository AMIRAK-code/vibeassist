import React from 'react';
import { DollarSign, Download, Activity, TrendingUp, Users } from 'lucide-react';
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
          <p style={{ color: '#2B75E8', fontSize: '0.8rem', marginTop: '8px', fontWeight: 'bold' }}>+12.5% from last week</p>
        </div>

        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Downloads</h4>
            <Download className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '2rem' }}>30,288</h2>
          <p style={{ color: '#2B75E8', fontSize: '0.8rem', marginTop: '8px', fontWeight: 'bold' }}>+5.2% from last week</p>
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

      <div className="glass-panel mt-4" style={{ height: '450px', padding: '32px' }}>
        <h3 className="mb-4">Comprehensive Growth & Profit Analysis</h3>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
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
            <YAxis stroke="#888" tick={{ fill: '#888' }} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#FAF9F6', borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} 
              itemStyle={{ fontWeight: 'bold' }}
            />
            <Legend verticalAlign="top" height={36}/>
            
            {/* The multi-layered chart */}
            <Area type="monotone" dataKey="revenue" name="Gross Revenue" fill="url(#colorRevenue)" stroke="#8CB9F0" strokeWidth={2} />
            <Area type="monotone" dataKey="profit" name="Net Profit" fill="url(#colorProfit)" stroke="#2B75E8" strokeWidth={3} />
            
            <Bar dataKey="paidDownloads" name="Paid Acquisition" barSize={12} fill="#2B75E8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="organicDownloads" name="Organic Installs" barSize={12} fill="#FCC624" radius={[4, 4, 0, 0]} />
            
            <Line type="monotone" dataKey="adSpend" name="Ad Spend" stroke="#000" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
