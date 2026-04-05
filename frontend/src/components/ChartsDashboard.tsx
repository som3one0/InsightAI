"use client";
import React from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#00E5FF', '#7000FF', '#FF00E5', '#FFB800', '#00FFA3'];

export default function ChartsDashboard({ chartSuggestion, chartData }: { chartSuggestion: string, chartData: any[] }) {
  if (!chartSuggestion || chartSuggestion === 'none' || !chartData || chartData.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#0B0F17]/40 backdrop-blur-md p-4 sm:p-8 rounded-2xl border border-[rgba(148,163,184,0.1)] shadow-2xl mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h3 className="text-lg font-semibold mb-6 flex flex-col sm:flex-row sm:items-center gap-3 text-[#F1F5F9]">
        <span>Auto-generated Visualization</span>
        <span className="px-2.5 py-0.5 bg-[rgba(0,229,255,0.1)] text-[#00E5FF] rounded-full text-[10px] font-mono uppercase tracking-widest border border-[rgba(0,229,255,0.2)] w-fit">
          {chartSuggestion}
        </span>
      </h3>
      
      <div className="h-[250px] sm:h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartSuggestion === 'bar' ? (
            <BarChart data={chartData} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis 
                dataKey="name" 
                stroke="#64748B" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dy={10}
                tick={{ fill: '#94A3B8' }}
              />
              <YAxis 
                stroke="#64748B" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dx={-5}
                tick={{ fill: '#94A3B8' }}
              />
              <Tooltip 
                cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }} 
                contentStyle={{ 
                  backgroundColor: '#0F172A', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(148,163,184,0.2)', 
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                  color: '#F1F5F9'
                }} 
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          ) : chartSuggestion === 'line' ? (
            <LineChart data={chartData} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis 
                dataKey="name" 
                stroke="#64748B" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dy={10}
                tick={{ fill: '#94A3B8' }}
              />
              <YAxis 
                stroke="#64748B" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dx={-5}
                tick={{ fill: '#94A3B8' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0F172A', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(148,163,184,0.2)', 
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                  color: '#F1F5F9'
                }} 
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#00E5FF" 
                strokeWidth={3} 
                dot={{ r: 4, fill: '#00E5FF', strokeWidth: 0 }} 
                activeDot={{ r: 6, stroke: '#00E5FF', strokeWidth: 2, fill: '#0F172A' }} 
              />
            </LineChart>
          ) : chartSuggestion === 'pie' ? (
            <PieChart>
              <Pie 
                data={chartData} 
                dataKey="value" 
                nameKey="name" 
                cx="50%" 
                cy="50%" 
                innerRadius={60}
                outerRadius={80} 
                paddingAngle={5}
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0F172A', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(148,163,184,0.2)', 
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                  color: '#F1F5F9'
                }} 
              />
            </PieChart>
          ) : (
            <div className="flex items-center justify-center h-full text-[#64748B] font-medium italic">
              No visualization data available for this query
            </div>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
