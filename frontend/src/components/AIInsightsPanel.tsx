"use client";

import { useState, useEffect } from 'react';
import { Sparkles, BarChart3, TrendingUp, Hash, ArrowUpDown, AlertTriangle, Search, MessageCircle, X } from 'lucide-react';
import axios from 'axios';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useChatStore } from '../store/chatStore';

interface InsightCard {
  question: string;
  type: string;
  result_table: Record<string, any>[];
  result_columns: string[];
  chart_data: { name: string; value: number }[];
  chart_type: string;
  summary_value: string | null;
}

interface AIInsightsPanelProps {
  sessionId: string;
  onViewChat?: () => void;
  onSetQuery?: (query: string) => void;
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof BarChart3; color: string }> = {
  top_values: { label: 'Top Values', icon: ArrowUpDown, color: '#7871c6' },
  aggregation: { label: 'Aggregation', icon: Hash, color: '#6ee7b7' },
  grouping: { label: 'Grouping', icon: BarChart3, color: '#93c5fd' },
  distribution: { label: 'Distribution', icon: BarChart3, color: '#fbbf24' },
  comparison: { label: 'Comparison', icon: TrendingUp, color: '#f87171' },
  outlier: { label: 'Outliers', icon: AlertTriangle, color: '#fb923c' },
  trend: { label: 'Trend', icon: TrendingUp, color: '#a78bfa' },
};

const tooltipStyle = {
  background: '#1c1c1e',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 10,
  color: '#e5e5e5',
  fontSize: 12,
  fontFamily: 'Inter, -apple-system, sans-serif',
  padding: '6px 10px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
};

function InsightChart({ chartType, chartData }: { chartType: string; chartData: { name: string; value: number }[] }) {
  if (!chartData || chartData.length === 0 || chartType === 'none') return null;

  return (
     <div className="h-[400px] w-full mt-3">
       <ResponsiveContainer width="100%" height="100%">
        {chartType === 'line' ? (
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 12" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="name" stroke="transparent" tickLine={false} axisLine={false} dy={8} tick={{ fill: '#52525b', fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis stroke="transparent" tickLine={false} axisLine={false} dx={-2} tick={{ fill: '#3f3f46', fontSize: 8 }} width={40} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(167,139,250,0.08)', strokeWidth: 1 }} />
            <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: '#a78bfa', stroke: '#131313', strokeWidth: 2 }} isAnimationActive animationDuration={700} animationEasing="ease-out" />
          </LineChart>
        ) : chartType === 'histogram' ? (
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} barGap={0} barCategoryGap={2}>
            <CartesianGrid strokeDasharray="3 12" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="name" stroke="transparent" tickLine={false} axisLine={false} dy={8} tick={{ fill: '#52525b', fontSize: 8 }} interval={0} />
            <YAxis stroke="transparent" tickLine={false} axisLine={false} dx={-2} tick={{ fill: '#3f3f46', fontSize: 8 }} width={40} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.015)' }} />
            <Bar dataKey="value" fill="#7871c6" radius={[1, 1, 0, 0]} isAnimationActive animationDuration={600} animationEasing="ease-out" />
          </BarChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="insightBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7871c6" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#7871c6" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 12" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="name" stroke="transparent" tickLine={false} axisLine={false} dy={8} tick={{ fill: '#52525b', fontSize: 9 }} interval={chartData.length > 6 ? 1 : 0} />
            <YAxis stroke="transparent" tickLine={false} axisLine={false} dx={-2} tick={{ fill: '#3f3f46', fontSize: 8 }} width={40} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.015)' }} />
            <Bar dataKey="value" fill="url(#insightBarGrad)" radius={[5, 5, 1, 1]} maxBarSize={28} isAnimationActive animationDuration={600} animationEasing="ease-out" />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function InsightTable({ columns, rows }: { columns: string[]; rows: Record<string, any>[] }) {
  if (!columns || columns.length === 0 || !rows || rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/[0.04] overflow-hidden bg-[#0f0f0f]">
      <div className="overflow-x-auto max-h-[140px] overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-white/[0.02]">
              {columns.map((col, ci) => (
                <th key={ci} className="px-3 py-[7px] text-left text-[9px] uppercase tracking-[0.08em] text-[#444] font-semibold whitespace-nowrap border-b border-white/[0.04]">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 6).map((row, ri) => (
              <tr key={ri} className={`${ri % 2 === 0 ? '' : 'bg-white/[0.01]'} hover:bg-white/[0.03] transition-colors duration-75`}>
                {columns.map((col, ci) => {
                  const val = row[col] !== undefined && row[col] !== null ? String(row[col]) : '\u2014';
                  const isNum = !isNaN(Number(val)) && val !== '\u2014';
                  return (
                    <td key={ci} className={`px-3 py-[5px] whitespace-nowrap border-b border-white/[0.02] ${ci === 0 ? 'text-[#c8c8c8] font-medium' : 'text-[#777]'} ${isNum ? 'tabular-nums text-right' : ''}`}>
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExplainPanel({ text, isLoading }: { text?: string; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-2 animate-slide-down">
        <div className="flex gap-[3px]">
          <span className="w-[4px] h-[4px] rounded-full bg-[#7871c6] animate-pulse-dot" />
          <span className="w-[4px] h-[4px] rounded-full bg-[#7871c6] animate-pulse-dot" style={{ animationDelay: '0.2s' }} />
          <span className="w-[4px] h-[4px] rounded-full bg-[#7871c6] animate-pulse-dot" style={{ animationDelay: '0.4s' }} />
        </div>
        <span className="text-[11px] text-[#444]">Analyzing...</span>
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="mt-3 pt-3 border-t border-white/[0.04] animate-slide-down">
      <div className="flex items-start gap-2">
        <MessageCircle className="w-3.5 h-3.5 text-[#7871c6] mt-0.5 shrink-0" />
        <p className="text-[12px] text-[#999] leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

export default function AIInsightsPanel({ sessionId, onViewChat, onSetQuery }: AIInsightsPanelProps) {
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [aiMetadata, setAiMetadata] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [explainingIdx, setExplainingIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const setSessionAiInsights = useChatStore(state => state.setSessionAiInsights);
  const getSessionAiInsights = useChatStore(state => state.getSessionAiInsights);

  // Load cached insights when session changes
  useEffect(() => {
    if (!sessionId) return;
    
    const cached = getSessionAiInsights(sessionId);
    if (cached && cached.insights && cached.insights.length > 0) {
      // Check if cache is less than 30 minutes old
      const cacheAge = Date.now() - (cached.generatedAt || 0);
      if (cacheAge < 30 * 60 * 1000) {
        setInsights(cached.insights);
        setAiMetadata(cached.aiMetadata || null);
        return;
      }
    }
    // Clear state if no valid cache
    setInsights([]);
    setAiMetadata(null);
    setError(null);
    setIsLoading(false);
    setFilter('all');
    setSearch('');
    setExplanations({});
  }, [sessionId, getSessionAiInsights]);

  const hasGenerated = insights.length > 0;

  const generateInsights = async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await axios.post(`http://127.0.0.1:8000/api/insights/generate/${sessionId}`);
      const newInsights = res.data.insights || [];
      const metadata = res.data.ai_metadata || null;
      setInsights(newInsights);
      setAiMetadata(metadata);
      // Cache insights in store
      setSessionAiInsights(sessionId, newInsights, metadata);
    } catch (err) {
      console.error("Failed to generate insights", err);
      setError("Failed to generate insights. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExplain = async (idx: number, question: string) => {
    // Toggle off if already open
    if (explanations[idx] !== undefined) {
      setExplanations(prev => {
        const next = { ...prev };
        delete next[idx];
        return next;
      });
      return;
    }

    setExplainingIdx(idx);
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/ask', {
        question: `Explain this briefly in 1-2 sentences: ${question}`,
        session_id: sessionId,
      });
      setExplanations(prev => ({ ...prev, [idx]: res.data.answer }));
    } catch {
      setExplanations(prev => ({ ...prev, [idx]: 'Could not generate explanation.' }));
    } finally {
      setExplainingIdx(null);
    }
  };

  const filtered = insights.filter(i => {
    if (filter !== 'all' && i.type !== filter) return false;
    if (search && !i.question.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const typeCounts = insights.reduce<Record<string, number>>((acc, i) => {
    acc[i.type] = (acc[i.type] || 0) + 1;
    return acc;
  }, {});

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-4 p-8 text-center bg-[#0f0f0f] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#7871c6]/[0.02] to-transparent" />
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-t-2 border-[#7871c6]/40 animate-spin" />
          <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-[#7871c6] animate-pulse" />
        </div>
        <div className="space-y-1 relative">
          <h3 className="text-[15px] font-medium text-[#f4f4f5]">Analyzing dataset...</h3>
          <p className="text-[12px] text-[#52525b] max-w-[220px]">Searching for patterns, outliers, and key metrics in your data.</p>
        </div>
        <div className="flex gap-[5px] mt-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7871c6]/40 animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#7871c6]/40 animate-pulse" style={{ animationDelay: '0.2s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[#7871c6]/40 animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-5 p-8 text-center bg-[#0f0f0f]">
        <div className="w-14 h-14 rounded-2xl bg-red-500/5 border border-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-[15px] font-medium text-red-200">Analysis Failed</h3>
          <p className="text-[12px] text-red-400/60 max-w-[240px]">{error}</p>
        </div>
        <button 
          onClick={generateInsights}
          className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/15 text-red-300 text-[12px] font-medium rounded-xl transition-all border border-red-500/10 hover:border-red-500/20 active:scale-95"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

  // Empty state
  if (!hasGenerated) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center bg-[#0f0f0f]">
        <div className="w-16 h-16 rounded-2xl bg-[#131315] border border-white/[0.05] flex items-center justify-center mb-5 shadow-lg shadow-black/20">
          <Sparkles className="w-7 h-7 text-[#7871c6]" />
        </div>
        <h3 className="text-[15px] font-semibold text-[#e5e5e5] mb-1.5 tracking-tight">AI Auto Analysis</h3>
        <p className="text-[13px] text-[#52525b] mb-6 max-w-[280px] leading-relaxed">
          Pandas-powered insights from your dataset. No hallucination &mdash; just real numbers.
        </p>
        <button
          onClick={generateInsights}
          className="px-6 py-2.5 rounded-xl bg-[#7871c6] text-white text-[13px] font-medium hover:bg-[#6d65bb] transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-[#7871c6]/20 active:scale-[0.97]"
        >
          Generate Insights
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0f0f0f]">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 shrink-0 border-b border-white/[0.04]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#7871c6]" />
            <h2 className="text-[14px] font-semibold text-[#e5e5e5] tracking-tight">AI Insights</h2>
            <span className="text-[10px] text-[#3f3f46] bg-[#141414] px-2 py-0.5 rounded-md font-medium">{filtered.length}</span>
          </div>
          <button
            onClick={generateInsights}
            className="text-[11px] text-[#52525b] hover:text-[#7871c6] transition-colors duration-150 cursor-pointer"
          >
            Regenerate
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3f3f46]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search insights..."
            className="w-full bg-[#141414] border border-white/[0.05] rounded-lg pl-9 pr-3 py-[7px] text-[12px] text-[#d4d4d4] placeholder-[#3f3f46] focus:outline-none focus:border-white/[0.1] transition-colors duration-150"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter('all')}
            className={`text-[10px] px-2.5 py-[5px] rounded-lg transition-all duration-150 cursor-pointer ${
              filter === 'all'
                ? 'bg-white/[0.06] text-[#e5e5e5] border border-white/[0.08]'
                : 'text-[#52525b] hover:text-[#737373] border border-transparent'
            }`}
          >
            All
          </button>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
            if (!typeCounts[key]) return null;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`text-[10px] px-2.5 py-[5px] rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                  filter === key
                    ? 'bg-white/[0.06] text-[#e5e5e5] border border-white/[0.08]'
                    : 'text-[#52525b] hover:text-[#737373] border border-transparent'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Masonry cards */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* AI Recommendations Section */}
        {aiMetadata?.suggestions && aiMetadata.suggestions.length > 0 && (
          <div className="mb-6 animate-slide-down">
            <div className="flex items-center gap-2 mb-3 px-1">
              <Sparkles className="w-3.5 h-3.5 text-[#00E5FF]" />
              <h3 className="text-[12px] font-semibold text-[#e5e5e5] uppercase tracking-wider">AI Recommendations</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {aiMetadata.suggestions.map((s: any, idx: number) => {
                const query = typeof s?.query === 'string' ? s.query : '';
                const title = typeof s?.title === 'string' ? s.title : '';
                const description = typeof s?.description === 'string' ? s.description : '';
                const type = typeof s?.type === 'string' ? s.type : '';
                if (!query) return null;
                return (
                <button
                  key={idx}
                  onClick={() => {
                    if (onSetQuery && onViewChat) {
                      onSetQuery(query);
                      onViewChat();
                    }
                  }}
                  className="flex flex-col items-start text-left p-3.5 rounded-xl bg-[#1a1a1c] border border-white/[0.04] hover:border-[#00E5FF]/20 hover:bg-[#131315] transition-all duration-200 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[#00E5FF]/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="text-[10px] text-[#00E5FF] font-medium uppercase tracking-tighter mb-1 relative">{type}</span>
                  <p className="text-[13px] font-medium text-[#f1f1f1] mb-1 relative">{title}</p>
                  <p className="text-[11px] text-[#71717a] leading-snug relative">{description}</p>
                </button>
              );})}
            </div>
          </div>
        )}

        {/* Global Related Queries Chips */}
        {aiMetadata?.summary?.topics_explored && aiMetadata.summary.topics_explored.length > 0 && (
          <div className="mb-6 animate-slide-down">
            <div className="flex items-center gap-2 mb-2.5 px-1">
              <TrendingUp className="w-3.5 h-3.5 text-[#8B5CF6]" />
              <h3 className="text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-wider">Related Analysis</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {aiMetadata.summary.topics_explored.map((topic: string, idx: number) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (onSetQuery && onViewChat) {
                      onSetQuery(`Analyze ${topic} in detail`);
                      onViewChat();
                    }
                  }}
                  className="px-3 py-1.5 rounded-full bg-[#131315] border border-white/[0.04] text-[11px] text-[#d4d4d8] hover:text-white hover:border-[#8B5CF6]/30 hover:bg-[#1a1a1c] transition-all transform hover:scale-[1.02] cursor-pointer"
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[13px] text-[#3f3f46]">No insights match your filter.</p>
          </div>
        ) : (
          <div className="masonry-grid">
            {filtered.map((insight, idx) => {
              const cfg = TYPE_CONFIG[insight.type] || TYPE_CONFIG.aggregation;
              const Icon = cfg.icon;
              const isHovered = hoveredIdx === idx;
              const hasTable = insight.result_table.length > 0 && insight.result_columns.length > 0;
              const hasChart = insight.chart_data && insight.chart_data.length > 0 && insight.chart_type !== 'none';
              const hasExplanation = explanations[idx] !== undefined;
              const isExplaining = explainingIdx === idx;

              return (
                <div
                  key={idx}
                  className="masonry-item animate-card-enter"
                  style={{ animationDelay: `${idx * 40}ms` }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <div
                    className={`insight-card rounded-2xl border bg-[#131313] p-4 ${
                      isHovered ? 'border-white/[0.08]' : 'border-white/[0.04]'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-[26px] h-[26px] rounded-lg flex items-center justify-center shrink-0 transition-all duration-200"
                        style={{
                          backgroundColor: `${cfg.color}12`,
                          boxShadow: isHovered ? `0 0 12px ${cfg.color}15` : 'none',
                        }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-[12px] font-medium text-[#d4d4d4] truncate leading-tight">
                          {insight.question}
                        </h4>
                        <span className="text-[9px] uppercase tracking-wider text-[#3f3f46]">{cfg.label}</span>
                      </div>
                    </div>

                    {/* Summary value */}
                    {insight.summary_value && (
                      <div className="text-[14px] font-semibold text-[#e5e5e5] mb-2 tracking-tight tabular-nums">
                        {insight.summary_value}
                      </div>
                    )}

                    {/* Table */}
                    {hasTable && <InsightTable columns={insight.result_columns} rows={insight.result_table} />}

                    {/* Chart */}
                    {hasChart && <InsightChart chartType={insight.chart_type} chartData={insight.chart_data} />}

                    {/* Explain toggle */}
                    <div className="mt-3 flex items-center justify-between">
                      <button
                        onClick={() => toggleExplain(idx, insight.question)}
                        disabled={isExplaining}
                        className={`text-[11px] flex items-center gap-1.5 transition-colors duration-150 cursor-pointer disabled:cursor-wait ${
                          hasExplanation
                            ? 'text-[#7871c6]'
                            : 'text-[#3f3f46] hover:text-[#7871c6]'
                        }`}
                      >
                        {hasExplanation ? (
                          <X className="w-3 h-3" />
                        ) : (
                          <MessageCircle className="w-3 h-3" />
                        )}
                        {isExplaining ? 'Analyzing...' : hasExplanation ? 'Hide' : 'Explain'}
                      </button>
                    </div>

                    {/* Explanation panel */}
                    {(hasExplanation || isExplaining) && (
                      <ExplainPanel text={explanations[idx]} isLoading={isExplaining} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
