"use client";
import { useEffect, useState, useMemo } from 'react';
import { 
  Sparkles, ChevronDown, ChevronUp, Brain, BarChart3, LineChart, ScatterChart, BarChart2,
  TrendingUp, AlertTriangle, Link2, FolderTree, Activity, Zap, Target, Star
} from 'lucide-react';

interface Insight {
  title: string;
  value: string;
  explanation: string;
  type: string;
  chart_type?: string;
  data?: Record<string, unknown>;
  _idx?: number;
}

interface InsightGroup {
  title: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  insights: Insight[];
}

const GROUP_CONFIG: Record<string, { title: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  trend: { title: 'Trends', icon: <TrendingUp className="w-4 h-4" />, color: 'text-[#14B8A6]', bgColor: 'bg-[rgba(20,184,166,0.1)]' },
  outlier: { title: 'Outliers', icon: <AlertTriangle className="w-4 h-4" />, color: 'text-[#F43F5E]', bgColor: 'bg-[rgba(244,63,94,0.1)]' },
  correlation: { title: 'Correlations', icon: <Link2 className="w-4 h-4" />, color: 'text-[#8B5CF6]', bgColor: 'bg-[rgba(139,92,246,0.1)]' },
  group: { title: 'Categories', icon: <FolderTree className="w-4 h-4" />, color: 'text-[#6366F1]', bgColor: 'bg-[rgba(99,102,241,0.1)]' },
  distribution: { title: 'Distribution', icon: <Activity className="w-4 h-4" />, color: 'text-[#06B6D4]', bgColor: 'bg-[rgba(6,182,212,0.1)]' },
  pattern: { title: 'Patterns', icon: <Target className="w-4 h-4" />, color: 'text-[#EC4899]', bgColor: 'bg-[rgba(236,72,153,0.1)]' },
};

function getSignalLabel(insight: Insight): { label: string; color: string; icon: React.ReactNode } | null {
  const type = insight.type?.toLowerCase();
  if (type === 'correlation') {
    const corr = insight.data?.correlation as number;
    if (corr && Math.abs(corr) >= 0.8) return { label: 'Strong Signal', color: 'text-[#10B981]', icon: <Zap className="w-3 h-3" /> };
    return { label: 'Interesting Pattern', color: 'text-[#00E5FF]', icon: <Activity className="w-3 h-3" /> };
  }
  if (type === 'outlier') {
    const pct = insight.data?.outlier_percentage as number;
    if (pct && pct > 5) return { label: 'Outlier Detected', color: 'text-[#F43F5E]', icon: <AlertTriangle className="w-3 h-3" /> };
    return { label: 'Data Point', color: 'text-[#F59E0B]', icon: <Star className="w-3 h-3" /> };
  }
  if (type === 'trend') {
    const r2 = insight.data?.r_squared as number;
    if (r2 && r2 >= 0.6) return { label: 'Strong Signal', color: 'text-[#10B981]', icon: <Zap className="w-3 h-3" /> };
    return { label: 'Interesting Pattern', color: 'text-[#00E5FF]', icon: <Activity className="w-3 h-3" /> };
  }
  if (type === 'group') return { label: 'Key Finding', color: 'text-[#6366F1]', icon: <Star className="w-3 h-3" /> };
  if (type === 'pattern') {
    const topPct = insight.data?.top_1_pct as number;
    if (topPct && topPct > 50) return { label: 'Dominant Pattern', color: 'text-[#EC4899]', icon: <Target className="w-3 h-3" /> };
    return { label: 'Pattern', color: 'text-[#F59E0B]', icon: <Activity className="w-3 h-3" /> };
  }
  return null;
}

function isImportant(insight: Insight): boolean {
  const type = insight.type?.toLowerCase();
  if (type === 'correlation') { const corr = insight.data?.correlation as number; return corr ? Math.abs(corr) >= 0.7 : false; }
  if (type === 'outlier') { const pct = insight.data?.outlier_percentage as number; return pct ? pct > 3 : false; }
  if (type === 'trend') { const r2 = insight.data?.r_squared as number; return r2 ? r2 >= 0.5 : false; }
  if (type === 'group') return true;
  if (type === 'pattern') { const topPct = insight.data?.top_1_pct as number; return topPct ? topPct > 30 : false; }
  return false;
}

export default function InsightsPanel({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const groupedInsights = useMemo(() => {
    const groups: Record<string, Insight[]> = {};
    data.forEach((insight, idx) => {
      const type = insight.type?.toLowerCase() || 'other';
      if (!groups[type]) groups[type] = [];
      groups[type].push({ ...insight, _idx: idx });
    });
    const orderedGroups: InsightGroup[] = [];
    const order = ['correlation', 'outlier', 'trend', 'group', 'pattern', 'distribution'];
    order.forEach(type => {
      if (groups[type]?.length) {
        const config = GROUP_CONFIG[type];
        orderedGroups.push({ title: config?.title || type, icon: config?.icon || <Activity className="w-4 h-4" />, color: config?.color || 'text-[#94A3B8]', bgColor: config?.bgColor || 'bg-[rgba(148,163,184,0.1)]', insights: groups[type] });
      }
    });
    return orderedGroups;
  }, [data]);

  useEffect(() => {
    async function fetchInsights() {
      if (!sessionId) return;
      try {
        const resp = await fetch(`http://127.0.0.1:8000/api/insights/${sessionId}`);
        if (!resp.ok) throw new Error("Failed");
        const json = await resp.json();
        setData(Array.isArray(json.insights) ? json.insights : []);
      } catch { setData([]); } finally { setLoading(false); }
    }
    fetchInsights();
  }, [sessionId]);

  const toggleExpand = (key: string) => {
    setExpandedCards(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  const getChartIcon = (chartType?: string) => {
    switch (chartType) {
      case 'bar': return <BarChart3 className="w-3 h-3 text-[#6366F1]" />;
      case 'line': return <LineChart className="w-3 h-3 text-[#14B8A6]" />;
      case 'scatter': return <ScatterChart className="w-3 h-3 text-[#8B5CF6]" />;
      case 'histogram': return <BarChart2 className="w-3 h-3 text-[#06B6D4]" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-4 border-b border-[rgba(148,163,184,0.1)]">
          <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#00E5FF]" /><p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">AI Analysis</p></div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3].map(i => (<div key={i} className="space-y-3"><div className="h-4 w-24 skeleton-cyber rounded" /><div className="h-24 w-full skeleton-cyber rounded-xl" /></div>))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-4 border-b border-[rgba(148,163,184,0.1)]">
          <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#00E5FF]" /><p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">AI Analysis</p></div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center"><Brain className="w-10 h-10 text-[#475569] mx-auto mb-3" /><p className="text-sm text-[#64748B]">No insights generated</p><p className="text-xs text-[#475569] mt-1">Ask a question to get started</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 border-b border-[rgba(148,163,184,0.1)] bg-[#0A0F1C]/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#00E5FF]" /><p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">AI Analysis</p></div>
          <span className="text-[10px] text-[#64748B] bg-[rgba(0,229,255,0.1)] px-2 py-1 rounded-full border border-[rgba(0,229,255,0.15)]">{data.length} findings</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {groupedInsights.map((group, gIdx) => (
          <div key={group.title} className="border-b border-[rgba(148,163,184,0.08)]">
            <div className={`px-4 py-3 ${group.bgColor} flex items-center gap-2 sticky top-0 backdrop-blur-sm`}>
              <span className={group.color}>{group.icon}</span>
              <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">{group.title}</span>
              <span className="text-[10px] text-[#64748B] bg-[#0A0F1C] px-2 py-0.5 rounded ml-auto">{group.insights.length}</span>
            </div>
            <div className="p-3 space-y-3">
              {group.insights.map((insight, iIdx) => {
                const key = `${gIdx}-${iIdx}`;
                const isExpanded = expandedCards.has(key);
                const isImportantInsight = isImportant(insight);
                const signalLabel = getSignalLabel(insight);
                const type = insight.type?.toLowerCase();
                const bgClass = type === 'correlation' ? 'bg-[rgba(139,92,246,0.08)] border-[rgba(139,92,246,0.15)]'
                  : type === 'outlier' ? 'bg-[rgba(244,63,94,0.08)] border-[rgba(244,63,94,0.15)]'
                  : type === 'trend' ? 'bg-[rgba(20,184,166,0.08)] border-[rgba(20,184,166,0.15)]'
                  : type === 'group' ? 'bg-[rgba(99,102,241,0.08)] border-[rgba(99,102,241,0.15)]'
                  : type === 'pattern' ? 'bg-[rgba(236,72,153,0.08)] border-[rgba(236,72,153,0.15)]'
                  : 'bg-[rgba(0,229,255,0.05)] border-[rgba(0,229,255,0.1)]';
                return (
                  <div key={key} className={`relative rounded-xl border overflow-hidden transition-all duration-300 ${bgClass} ${isImportantInsight ? 'ring-1 ring-[rgba(0,229,255,0.3)]' : ''} card-lift`}>
                    {isImportantInsight && (<div className="absolute top-0 right-0"><div className="bg-[rgba(0,229,255,0.15)] px-2 py-1 rounded-bl text-[9px] font-semibold text-[#00E5FF] flex items-center gap-1"><Zap className="w-2.5 h-2.5" />IMPORTANT</div></div>)}
                    <div className="p-4 cursor-pointer" onClick={() => toggleExpand(key)}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {signalLabel && (<span className={`text-[9px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full ${signalLabel.color.replace('text-', 'bg-[').replace(']', '/20]')}`}>{signalLabel.icon}{signalLabel.label}</span>)}
                          </div>
                          <p className="text-[13px] font-medium text-[#F1F5F9]">{insight.title}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {getChartIcon(insight.chart_type)}
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isExpanded ? 'bg-[rgba(0,229,255,0.2)] text-[#00E5FF]' : 'bg-[rgba(148,163,184,0.1)] text-[#64748B]'}`}>{isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-baseline gap-2"><span className="text-lg font-bold text-[#00E5FF]">{insight.value}</span></div>
                      <p className="text-[11px] text-[#64748B] mt-2 line-clamp-2">{insight.explanation}</p>
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-[rgba(148,163,184,0.1)] bg-[#0A0F1C]/30">
                        <div className="pt-3 flex items-start gap-2"><Brain className="w-4 h-4 text-[#00E5FF] mt-0.5 flex-shrink-0" /><p className="text-[12px] text-[#94A3B8] leading-relaxed">{insight.explanation}</p></div>
                        {insight.data && (
                          <div className="mt-3 pt-3 border-t border-[rgba(148,163,184,0.08)]">
                            <p className="text-[9px] text-[#475569] mb-2 uppercase tracking-wider">Data Details</p>
                            <div className="text-[11px] text-[#64748B] font-mono-data bg-[#0A0F1C] p-3 rounded-lg overflow-x-auto flex flex-wrap gap-x-4 gap-y-1">
                              {Object.entries(insight.data).slice(0, 6).map(([k, v]) => (<span key={k} className="whitespace-nowrap"><span className="text-[#475569]">{k}:</span> <span className="text-[#00E5FF]">{String(v)}</span></span>))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}