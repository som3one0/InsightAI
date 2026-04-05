"use client";

import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import { 
  Database, FileText, Sparkles, TrendingUp, 
  Clock, ArrowRight, ShieldCheck, Zap
} from 'lucide-react';

interface DashboardProps {
  onSelectSession: (id: string) => void;
  onRefresh: () => void;
}

export default function Dashboard({ onSelectSession, onRefresh }: DashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/summary');
        setStats(res.data);
      } catch (err) {
        console.error("Dashboard stats failed", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[rgba(0,229,255,0.1)] border border-[rgba(0,229,255,0.2)]" />
          <p className="text-[#64748B] text-sm font-medium tracking-widest uppercase">Initializing Pulse...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Records', value: stats?.total_rows?.toLocaleString(), icon: Database, color: '#00E5FF', bg: 'rgba(0,229,255,0.1)' },
    { label: 'Saved Insights', value: stats?.total_insights, icon: Sparkles, color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
    { label: 'Active Sessions', value: stats?.total_sessions, icon: FileText, color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
    { label: 'Data Quality', value: `${stats?.avg_quality}%`, icon: ShieldCheck, color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 stagger-children">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-white">Executive Hub</h2>
          <p className="text-[#64748B]">Cross-dataset intelligence and system health overview.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onRefresh}
            className="px-4 py-2 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(148,163,184,0.1)] text-xs font-semibold text-[#94A3B8] hover:bg-[rgba(255,255,255,0.05)] transition-all"
          >
            Update Metrics
          </button>
        </div>
      </div>

      {/* Stat Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <div key={i} className="glass-premium p-6 relative overflow-hidden group hover:border-[rgba(0,229,255,0.3)] transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <card.icon size={48} color={card.color} />
            </div>
            <div className="space-y-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: card.bg }}>
                  <card.icon size={16} color={card.color} />
                </div>
                <span className="text-xs font-bold text-[#64748B] uppercase tracking-widest">{card.label}</span>
              </div>
              <div className="text-3xl font-bold text-white tracking-tighter">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <div className="lg:col-span-2 glass-premium p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-4 h-4 text-[#00E5FF]" />
              <span className="text-sm font-bold text-white">Analysis Velocity</span>
            </div>
            <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-widest">Last 7 Days</span>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.activity_chart}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00E5FF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#475569', fontSize: 10}}
                  tickFormatter={(val) => val.split('-').slice(1).join('/')}
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0F172A', border: '1px solid rgba(148,163,184,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#00E5FF', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="count" stroke="#00E5FF" fillOpacity={1} fill="url(#colorCount)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Actions / Recent */}
        <div className="glass-premium p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <Clock className="w-4 h-4 text-[#8B5CF6]" />
            <span className="text-sm font-bold text-white">Resume Analytics</span>
          </div>
          <div className="flex-1 space-y-3">
            {stats?.recent_sessions?.map((s: any) => (
              <button 
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className="w-full p-4 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(0,229,255,0.2)] hover:bg-[rgba(0,229,255,0.02)] transition-all flex items-center justify-between group"
              >
                <div className="text-left">
                  <div className="text-xs font-bold text-white truncate max-w-[140px]">{s.name}</div>
                  <div className="text-[10px] text-[#64748B]">{s.rows.toLocaleString()} rows</div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[#64748B] group-hover:text-[#00E5FF] group-hover:translate-x-1 transition-all" />
              </button>
            ))}
            {(!stats?.recent_sessions || stats.recent_sessions.length === 0) && (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center space-y-2 opacity-50">
                <Zap className="w-8 h-8 text-[#64748B]" />
                <p className="text-[10px] text-[#64748B] uppercase tracking-tighter">No recent activity</p>
              </div>
            )}
          </div>
          <div className="mt-6 pt-6 border-t border-[rgba(148,163,184,0.05)]">
             <div className="text-[10px] text-[#475569] font-bold uppercase tracking-widest text-center">
               InsightAI Core v2.0-Prod
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
