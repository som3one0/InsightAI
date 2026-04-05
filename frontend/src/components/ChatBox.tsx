"use client";
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Send, Sparkles, ChevronDown, ChevronUp, BarChart2, LineChart as LineChartIcon, PieChart, Loader2, Zap, Database, Lightbulb, BookOpen, Download, Check, AlertCircle, ArrowRight, RefreshCw, HelpCircle } from 'lucide-react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, PieChart as RechartsPie, Pie, Cell, ScatterChart, Scatter } from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore, ChatMessage, ChartConfig } from '@/store/chatStore';
import { sanitizeMessage, sanitizeChartConfig, sanitizeMessages, safeRenderValue } from '@/utils/sanitize';

interface ParsedResponse {
  summary: string;
  insights: string[];
  tableData?: { columns: string[]; rows: any[] };
  explanation?: string;
  rawContent: string;
}

function parseAIResponse(content: string, resultColumns?: string[], resultTable?: any[]): ParsedResponse {
  const lines = content.split('\n');
  let currentSection = 'summary';
  const summaryLines: string[] = [];
  const insightsLines: string[] = [];
  let explanationLines: string[] = [];
  let inInsights = false;
  let inExplanation = false;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.match(/^(summary|📊\s*Summary|●\s*Summary)/i)) {
      currentSection = 'summary';
      inInsights = false;
      inExplanation = false;
      continue;
    }
    
    if (trimmed.match(/^(insights|📈\s*Key\s*Insights|●\s*Key)/i)) {
      inInsights = true;
      currentSection = 'insights';
      continue;
    }
    
    if (trimmed.match(/^(explanation|🧠|explanation|details)/i)) {
      inExplanation = true;
      inInsights = false;
      currentSection = 'explanation';
      continue;
    }
    
    if (trimmed.startsWith('•') || trimmed.startsWith('- ') || trimmed.match(/^[-*]\s+/)) {
      if (inInsightSection(trimmed)) {
        insightsLines.push(trimmed.replace(/^[-*●]\s*/, ''));
      } else if (inExplanation) {
        explanationLines.push(trimmed);
      } else if (currentSection === 'summary') {
        summaryLines.push(trimmed.replace(/^[-*●]\s*/, ''));
      }
      continue;
    }
    
    if (trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.match(/^[\d.]+$/)) {
      if (inInsights) {
        insightsLines.push(trimmed);
      } else if (inExplanation) {
        explanationLines.push(trimmed);
      } else if (summaryLines.length < 2 || currentSection === 'summary') {
        summaryLines.push(trimmed);
      }
    }
  }

  function inInsightSection(line: string): boolean {
    const hasPercent = line.includes('%');
    const hasDollar = line.includes('$');
    const hasNumber = /\d+/.test(line);
    const hasKeyword = /increase|decrease|growth|total|average|mean|median|sum|count|change|higher|lower|best|worst|top|bottom/i.test(line);
    return hasPercent || hasDollar || hasNumber || hasKeyword;
  }

  const summary = summaryLines.slice(0, 2).join(' ').substring(0, 300);
  const insights = insightsLines.slice(0, 5).map(i => i.replace(/^[-*●]\s*/, ''));
  
  let tableData: ParsedResponse['tableData'];
  if (resultColumns && resultColumns.length > 0 && resultTable && resultTable.length > 0) {
    tableData = { columns: resultColumns, rows: resultTable };
  }

  return {
    summary: summary || content.substring(0, 200),
    insights,
    tableData,
    explanation: explanationLines.length > 0 ? explanationLines.join('\n') : undefined,
    rawContent: content,
  };
}

function formatNumber(value: any): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || !isFinite(num)) return String(value);
  if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (Math.abs(num) >= 1000) return num.toLocaleString();
  if (Math.abs(num) < 0.01 && num !== 0) return (num * 100).toFixed(1) + '%';
  if (Math.abs(num) < 1) return num.toFixed(2);
  return num.toLocaleString();
}

function isPercentageValue(value: any): boolean {
  if (typeof value === 'string') {
    return value.includes('%') || value.toLowerCase().includes('percent') || value.toLowerCase().includes('rate');
  }
  return false;
}

function extractNumber(value: any): string {
  if (typeof value === 'number') return value.toString();
  const str = String(value);
  const match = str.match(/[\d,]+\.?\d*/);
  return match ? match[0].replace(/,/g, '') : str;
}

interface ChatBoxProps {
  sessionId: string;
  externalQuery?: string;
  onQuerySubmitted?: () => void;
}

const API_TIMEOUT = 60000;
const API_BASE_URL = 'http://127.0.0.1:8000';

interface ChatBoxProps {
  sessionId: string;
  externalQuery?: string;
  onQuerySubmitted?: () => void;
}

export default function ChatBox({ sessionId, externalQuery, onQuerySubmitted }: ChatBoxProps) {
  const { messages: storeMessages, addMessage, setMessages: setStoreMessages, clearMessages } = useChatStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [starterQuestions, setStarterQuestions] = useState<string[]>([]);
  const [showProcessing, setShowProcessing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chartLoading, setChartLoading] = useState<Record<string, boolean>>({});
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(new Set());

  // Fix: Filter messages by session to avoid duplicates
  const messages = useMemo(() => {
    if (!sessionId) return localMessages;
    // Use localMessages from API as primary source, filter storeMessages for backup
    if (localMessages.length > 0) return localMessages;
    // Only use storeMessages that belong to this session
    return storeMessages.filter(m => m.id && m.timestamp > 0).slice(-50);
  }, [sessionId, localMessages, storeMessages]);

  // Clear local messages when session changes
  useEffect(() => {
    if (sessionId !== lastSessionId) {
      setLocalMessages([]);
      setLastSessionId(sessionId);
    }
  }, [sessionId, lastSessionId, setStoreMessages, clearMessages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      loadHistory();
      loadStarterQuestions();
    }
  }, [sessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (externalQuery && !isLoading) {
      handleSubmit(undefined, externalQuery);
      if (onQuerySubmitted) onQuerySubmitted();
    }
  }, [externalQuery]);

  const loadStarterQuestions = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/starter-questions/${sessionId}`);
      setStarterQuestions(res.data.questions || []);
    } catch {
      setStarterQuestions([]);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/sessions/${sessionId}`);
      const history: ChatMessage[] = res.data.history.map((h: any) => sanitizeMessage({
        id: h.id,
        role: h.role,
        content: h.content,
        isSaved: h.is_saved,
        followUpQuestions: h.follow_ups ? JSON.parse(h.follow_ups) : [],
        timestamp: new Date(h.created_at).getTime() || Date.now(),
        sessionId: sessionId,
      }));
      if (history.length > 0) {
        setLocalMessages(history);
        setStoreMessages(history);
        setStarterQuestions([]);
      } else {
        setLocalMessages([{ id: 'welcome', role: 'assistant', content: 'Hello! I\'ve analyzed your dataset. Ask me anything about your data.', timestamp: Date.now() }]);
      }
    } catch (err) {
      console.error("Failed to load history", err);
    }
  };

  const handleSaveQuery = async (queryId: string, currentStatus: boolean) => {
    try {
      await axios.post('http://127.0.0.1:8000/api/queries/save', {
        query_id: queryId, is_saved: !currentStatus
      });
      setLocalMessages(prev => prev.map(m => m.id === queryId ? { ...m, isSaved: !currentStatus } : m));
    } catch (err) {
      console.error("Failed to save query", err);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, forceInput?: string) => {
    if (e) e.preventDefault();
    const queryText = forceInput || input;
    if (!queryText.trim() || !sessionId || isLoading) return;

    const userMessage = queryText;
    if (!forceInput) setInput('');
    
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
      sessionId: sessionId,
    };
    
    setLocalMessages(prev => [...prev, userMsg]);
    addMessage(userMsg);
    setIsLoading(true);
    setIsProcessing(true);
    setStarterQuestions([]);
    setShowProcessing(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
      const resp = await fetch(`${API_BASE_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage, session_id: sessionId }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (resp.status === 404) throw new Error("SESSION_EXPIRED");
      if (!resp.ok) throw new Error("Request Failed");

      const data = await resp.json();

      const sanitizedData = sanitizeMessage({
        id: data.id || `msg-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'No response received',
        charts: data.charts?.map((c: ChartConfig, idx: number) => sanitizeChartConfig({
          ...c,
          id: `chart-${data.id}-${idx}`,
          showDataLabels: c.showDataLabels ?? true,
        })) || [],
        chartData: data.chart_data && data.chart_data.length > 0 ? data.chart_data : undefined,
        chartType: data.chart_suggestion || 'none',
        resultTable: data.result_table && data.result_table.length > 0 ? data.result_table : undefined,
        resultColumns: data.result_columns && data.result_columns.length > 0 ? data.result_columns : undefined,
        followUpQuestions: data.follow_up_questions || [],
        isSaved: false,
        timestamp: Date.now(),
        dataSource: data.data_source || 'computed',
        backendCalculations: data.backend_calculations ?? true,
        sessionId: sessionId,
      });

      setLocalMessages(prev => [...prev, sanitizedData]);
      addMessage(sanitizedData);
    } catch (e: any) {
      clearTimeout(timeoutId);
      
      if (e.name === 'AbortError') {
        const errMsg: ChatMessage = { id: `error-${Date.now()}`, role: 'assistant', content: "Request timed out. Please try again.", timestamp: Date.now(), sessionId };
        setLocalMessages(prev => [...prev, errMsg]);
        addMessage(errMsg);
      } else if (e.message === "SESSION_EXPIRED") {
        const errMsg: ChatMessage = { id: `error-${Date.now()}`, role: 'assistant', content: "Session expired. Please re-upload your file.", timestamp: Date.now(), sessionId };
        setLocalMessages(prev => [...prev, errMsg]);
        addMessage(errMsg);
      } else {
        const errMsg: ChatMessage = { id: `error-${Date.now()}`, role: 'assistant', content: "Something went wrong. Please try again.", timestamp: Date.now(), sessionId };
        setLocalMessages(prev => [...prev, errMsg]);
        addMessage(errMsg);
        console.error("Chat error:", e);
      }
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  const toggleReasoning = (msgId: string) => {
    setExpandedExplanations(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const getChartReason = (type: string, intent?: string): string => {
    const reasons: Record<string, string> = {
      line: "Line chart used to show trends over time or sequential data",
      bar: "Bar chart used to compare values across different categories",
      pie: "Pie chart used to show percentage distribution or share of categories",
      histogram: "Histogram used to show distribution of values",
      scatter: "Scatter plot used to show relationship between two variables",
    };
    return reasons[type] || "Chart visualization";
  };

  const exportChartAsImage = async (config: ChartConfig) => {
    const chartContainer = document.getElementById(`chart-${config.id}`);
    if (!chartContainer) return;

    try {
      // Create a canvas from the chart SVG
      const svg = chartContainer.querySelector('svg');
      if (!svg) return;

      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      canvas.width = 800;
      canvas.height = 400;

      img.onload = () => {
        if (ctx) {
          // Dark background
          ctx.fillStyle = '#0A0F1C';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Add title
          ctx.fillStyle = '#00E5FF';
          ctx.font = 'bold 16px Inter, sans-serif';
          ctx.fillText(config.title || 'Chart', 20, 30);

          // Download
          const link = document.createElement('a');
          link.download = `${config.title || 'chart'}-${Date.now()}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        }
      };

      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const exportChartAsCSV = (config: ChartConfig) => {
    if (!config.data || config.data.length === 0) return;

    const csvContent = [
      [config.xAxis || 'Label', config.yAxis || 'Value'].join(','),
      ...config.data.map(row => [row.name, row.value].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${config.title || 'chart-data'}-${Date.now()}.csv`;
    link.click();
  };

  const renderPremiumChart = (config: ChartConfig) => {
    const sanitized = sanitizeChartConfig(config);
    if (!sanitized || sanitized.type === 'none' || !sanitized.data || sanitized.data.length === 0) return null;
    
    const { type, title, xAxis, yAxis, data, colors, showDataLabels } = sanitized;
    const isLoading = sanitized.id ? chartLoading[sanitized.id] : false;
    
    if (isLoading) {
      return (
        <div className="chart-skeleton mt-4 animate-fade-in-up">
          <div className="h-[200px] bg-[rgba(0,229,255,0.05)] rounded-lg animate-pulse" />
        </div>
      );
    }

    const NEON_CYAN = '#00E5FF';
    const GRID = 'rgba(148, 163, 184, 0.08)';

    const chartColors = colors && colors.length > 0 ? colors : [NEON_CYAN];

    return (
      <div className="chart-container mt-4 animate-fade-in-up" key={config.id} id={`chart-${config.id}`}>
        {/* Chart Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[rgba(0,229,255,0.15)] flex items-center justify-center">
              {type === 'line' ? <LineChartIcon className="w-3.5 h-3.5 text-[#00E5FF]" /> : 
               type === 'pie' ? <PieChart className="w-3.5 h-3.5 text-[#00E5FF]" /> :
               type === 'scatter' ? <BarChart2 className="w-3.5 h-3.5 text-[#00E5FF]" /> :
               <BarChart2 className="w-3.5 h-3.5 text-[#00E5FF]" />}
            </div>
            <div>
              <span className="text-xs text-[#CBD5E1] font-medium">{title}</span>
              <div className="text-[10px] text-[#64748B]">{xAxis} → {yAxis}</div>
            </div>
          </div>
          {/* Export Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => exportChartAsImage(config)}
              className="p-1.5 rounded-lg hover:bg-[rgba(0,229,255,0.1)] text-[#64748B] hover:text-[#00E5FF] transition-colors"
              title="Download as PNG"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => exportChartAsCSV(config)}
              className="p-1.5 rounded-lg hover:bg-[rgba(0,229,255,0.1)] text-[#64748B] hover:text-[#00E5FF] transition-colors"
              title="Download as CSV"
            >
              <Database className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Why This Chart */}
        <div className="text-[10px] text-[#64748B] mb-2 flex items-center gap-1">
          <span className="text-[#00E5FF]">💡</span>
          {getChartReason(type)}
        </div>

        {/* Chart */}
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {type === 'line' ? (
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id={`lineGrad-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={NEON_CYAN} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={NEON_CYAN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 15" stroke={GRID} vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#475569" 
                  tick={{ fill: '#64748B', fontSize: 10 }} 
                  axisLine={false} 
                  tickLine={false}
                  dy={8}
                />
                <YAxis 
                  stroke="#475569" 
                  tick={{ fill: '#64748B', fontSize: 10 }} 
                  axisLine={false} 
                  tickLine={false}
                  dx={-5}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10, 15, 28, 0.95)',
                    border: '1px solid rgba(0, 229, 255, 0.2)',
                    borderRadius: 8,
                    color: '#F1F5F9',
                    fontSize: 12,
                    boxShadow: '0 0 20px rgba(0, 229, 255, 0.15)'
                  }}
                  formatter={(value) => [value !== undefined ? Number(value).toLocaleString() : value, yAxis]}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke={NEON_CYAN} 
                  strokeWidth={2}
                  fill={`url(#lineGrad-${config.id})`}
                  dot={{ fill: NEON_CYAN, stroke: '#0A0F1C', strokeWidth: 1, r: 3 }}
                  activeDot={{ r: 6, fill: NEON_CYAN, stroke: '#0A0F1C', strokeWidth: 2 }}
                  animationDuration={800}
                />
              </AreaChart>
            ) : type === 'pie' ? (
              <RechartsPie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10, 15, 28, 0.95)',
                    border: '1px solid rgba(0, 229, 255, 0.2)',
                    borderRadius: 8,
                    color: '#F1F5F9',
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [value !== undefined ? Number(value).toLocaleString() : value, name]}
                />
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  isAnimationActive
                  animationDuration={600}
                >
                  {data.map((entry: any, index: number) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={chartColors[index % chartColors.length]}
                      stroke="rgba(0,0,0,0)"
                      style={{ filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.3))' }}
                    />
                  ))}
                </Pie>
              </RechartsPie>
            ) : type === 'scatter' ? (
              <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 15" stroke={GRID} />
                <XAxis 
                  type="number" 
                  dataKey="value" 
                  stroke="#475569" 
                  tick={{ fill: '#64748B', fontSize: 10 }}
                  name={xAxis}
                />
                <YAxis 
                  type="number" 
                  dataKey="value" 
                  stroke="#475569" 
                  tick={{ fill: '#64748B', fontSize: 10 }}
                  name={yAxis}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10, 15, 28, 0.95)',
                    border: '1px solid rgba(0, 229, 255, 0.2)',
                    borderRadius: 8,
                    color: '#F1F5F9',
                    fontSize: 12,
                  }}
                  cursor={{ strokeDasharray: '3 3' }}
                />
                <Scatter 
                  data={data} 
                  fill={NEON_CYAN}
                  style={{ filter: 'drop-shadow(0 0 6px rgba(0,229,255,0.5))' }}
                />
              </ScatterChart>
            ) : (
              <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id={`barGrad-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={NEON_CYAN} stopOpacity={1} />
                    <stop offset="100%" stopColor={NEON_CYAN} stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 15" stroke={GRID} vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#475569" 
                  tick={{ fill: '#64748B', fontSize: 10 }} 
                  axisLine={false} 
                  tickLine={false}
                  dy={8}
                />
                <YAxis 
                  stroke="#475569" 
                  tick={{ fill: '#64748B', fontSize: 10 }} 
                  axisLine={false} 
                  tickLine={false}
                  dx={-5}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10, 15, 28, 0.95)',
                    border: '1px solid rgba(0, 229, 255, 0.2)',
                    borderRadius: 8,
                    color: '#F1F5F9',
                    fontSize: 12,
                    boxShadow: '0 0 20px rgba(0, 229, 255, 0.15)'
                  }}
                  formatter={(value) => [value !== undefined ? Number(value).toLocaleString() : value, yAxis]}
                />
                <Bar 
                  dataKey="value" 
                  fill={`url(#barGrad-${config.id})`}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                  animationDuration={600}
                  style={{ filter: 'drop-shadow(0 0 8px rgba(0,229,255,0.2))' }}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderChart = (chartType: string, chartData: any[]) => {
    if (!chartData || chartData.length === 0 || chartType === 'none') return null;
    return renderPremiumChart({ type: chartType as any, title: 'Chart', xAxis: '', yAxis: '', data: chartData, colors: [], showDataLabels: true });
  };

  const renderTable = (columns: string[], rows: any[], title?: string) => {
    if (!columns || columns.length === 0 || !rows || rows.length === 0) return null;

    return (
      <div className="ai-table-container animate-fade-in-up">
        {title && (
          <div className="ai-table-header">
            <span className="ai-table-title">{title}</span>
            <span className="ai-table-count">{rows.length} rows</span>
          </div>
        )}
        <div className="ai-table-wrapper">
          <table className="ai-table">
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <th key={i} className={i === 0 ? 'text-left' : 'text-right'}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row, ri) => (
                <tr key={ri} className={ri % 2 === 1 ? 'ai-row-alt' : ''}>
                  {columns.map((col, ci) => {
                    const rawVal = row[col];
                    const val = safeRenderValue(rawVal);
                    const isNum = !isNaN(Number(extractNumber(val))) && val !== '—' && !isPercentageValue(rawVal);
                    const isPct = isPercentageValue(rawVal);
                    return (
                      <td key={ci} className={isNum || isPct ? 'font-mono-data' : ''}>
                        <span className={isNum ? 'ai-number' : isPct ? 'ai-percentage' : ''}>
                          {isNum ? formatNumber(rawVal) : val}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 10 && (
          <div className="ai-table-footer">
            <span>Showing 1–{Math.min(rows.length, 10)} of {rows.length} rows</span>
          </div>
        )}
      </div>
    );
  };

  const renderAIResponse = (msg: ChatMessage, idx: number) => {
    const parsed = parseAIResponse(msg.content, msg.resultColumns, msg.resultTable);
    const isExplanationExpanded = expandedExplanations.has(msg.id);
    
    return (
      <div className="ai-response-card" style={{ animationDelay: `${idx * 30}ms` }}>
        {/* AI Header */}
        <div className="ai-response-header">
          <div className="ai-avatar">
            <Sparkles className="w-3.5 h-3.5 text-[#00E5FF]" />
          </div>
          <span className="ai-header-label">AI Analysis</span>
          <span className="ai-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {/* Summary Section */}
        {parsed.summary && (
          <div className="ai-section ai-summary">
            <div className="ai-section-icon">
              <span>📊</span>
            </div>
            <div className="ai-section-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {parsed.summary}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Key Insights Section */}
        {parsed.insights.length > 0 && (
          <div className="ai-section ai-insights">
            <div className="ai-section-icon">
              <span>📈</span>
            </div>
            <div className="ai-section-content">
              <ul className="ai-insights-list">
                {parsed.insights.slice(0, 5).map((insight, i) => (
                  <li key={i}>
                    <span className="ai-bullet">•</span>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {insight}
                    </ReactMarkdown>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Data Table Section */}
        {(parsed.tableData || (msg.resultColumns && msg.resultTable)) && renderTable(
          parsed.tableData?.columns || msg.resultColumns!,
          parsed.tableData?.rows || msg.resultTable!,
          'Data Results'
        )}

        {/* Charts */}
        {msg.charts && msg.charts.length > 0 && (
          <div className="ai-section">
            <div className="ai-section-content" style={{ width: '100%' }}>
              {msg.charts.map((chart, cidx) => (
                <div key={chart.id || `chart-${cidx}`} style={{ marginTop: cidx > 0 ? '20px' : 0 }}>
                  {renderPremiumChart(chart)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legacy chart */}
        {!msg.charts && msg.chartType && msg.chartData && renderChart(msg.chartType, msg.chartData)}

        {/* Collapsible Explanation */}
        {(parsed.explanation || msg.content.length > 500) && (
          <div className="ai-explanation-toggle">
            <button 
              onClick={() => toggleReasoning(msg.id)}
              className="ai-explanation-btn"
            >
              <span className="flex items-center gap-2">🧠 Explanation</span>
              {isExplanationExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {isExplanationExpanded && (
              <div className="ai-explanation-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {parsed.explanation || msg.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Follow-up Questions */}
        {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
          <div className="ai-followup-container">
            <span className="ai-followup-label">Or try asking</span>
            <div className="ai-followup-buttons">
              {msg.followUpQuestions.slice(0, 3).map((q, qidx) => (
                <button
                  key={qidx}
                  onClick={() => handleSubmit(undefined, q)}
                  className="ai-followup-btn"
                >
                  <ArrowRight className="w-3 h-3" />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderUserMessage = (msg: ChatMessage, idx: number) => (
    <div key={idx} className="user-message" style={{ animationDelay: `${idx * 30}ms` }}>
      <div className="user-message-bubble">{msg.content}</div>
    </div>
  );

  const renderErrorMessage = (msg: ChatMessage) => {
    const content = msg.content.toLowerCase();
    let errorTitle = 'Error';
    let errorMessage = msg.content;
    let suggestion = 'Try again or ask a different question.';

    if (content.includes('timeout')) {
      errorTitle = 'Request Timeout';
      errorMessage = 'The AI took too long to respond. Your dataset might be large.';
      suggestion = 'Try a simpler query or wait a moment and try again.';
    } else if (content.includes('expired') || content.includes('session')) {
      errorTitle = 'Session Expired';
      errorMessage = 'Your session has expired. Please re-upload your data file.';
      suggestion = 'Upload your data again to continue analyzing.';
    } else if (content.includes('failed') || content.includes('wrong')) {
      errorTitle = 'Processing Error';
      errorMessage = 'Something went wrong while processing your request.';
      suggestion = 'Check your data and try a different question.';
    }

    return (
      <div className="ai-error-card animate-fade-in-up">
        <div className="ai-error-header">
          <AlertCircle className="w-5 h-5 text-[#F43F5E]" />
          <span className="ai-error-title">❌ {errorTitle}</span>
        </div>
        <div className="ai-error-message">{errorMessage}</div>
        <div className="ai-error-suggestion">
          <HelpCircle className="w-4 h-4" />
          <span>{suggestion}</span>
        </div>
        <button 
          onClick={() => {
            const inputEl = inputRef.current;
            if (inputEl) {
              inputEl.focus();
            }
          }}
          className="ai-error-retry"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full chat-container">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto chat-messages">
        <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === 'user' ? renderUserMessage(msg, i) : (
                msg.id?.includes('error') ? renderErrorMessage(msg) : renderAIResponse(msg, i)
              )}
            </div>
          ))}

          {/* Loading State - AI Analyzing */}
          {isLoading && (
            <div className="ai-loading-card">
              <div className="ai-loading-header">
                <div className="ai-loading-dots">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
                <span className="ai-loading-text">AI is analyzing your data...</span>
              </div>
              <div className="ai-loading-progress">
                <div className="ai-loading-bar" />
              </div>
            </div>
          )}

          {/* Starter Questions - shown only when no messages yet */}
          {starterQuestions.length > 0 && messages.length <= 1 && !isLoading && (
            <div className="ai-starter-container">
              <p className="ai-starter-label">Try asking me about:</p>
              <div className="ai-starter-buttons">
                {starterQuestions.slice(0, 4).map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => { handleSubmit(undefined, q); setStarterQuestions([]); }}
                    className="ai-starter-btn"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <Sparkles className="w-3 h-3" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input - Premium SaaS style */}
      <div className="border-t border-[rgba(148,163,184,0.08)] bg-[rgba(15,23,42,0.6)] p-4">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Ask anything about your data..."
              rows={1}
              className="input-cyber w-full pr-12 resize-none max-h-32"
              disabled={isLoading || !sessionId}
            />
            <button
              type="submit"
              disabled={isLoading || !sessionId || !input.trim()}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-[#00E5FF] text-[#0A0F1C] hover:bg-[#00B8D4] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-[11px] text-[#475569] mt-2 text-center font-medium">Enter to send · Shift + Enter for new line</p>
        </div>
      </div>
    </div>
  );
}