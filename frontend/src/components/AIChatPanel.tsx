"use client";
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, User, Bot, Sparkles, Lightbulb, ChevronDown, Loader2 } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

interface LocalChatMessage {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
}

interface AIChatPanelProps {
  sessionId: string;
  onChartGenerated: (suggestion: string, data: any[]) => void;
}

export default function AIChatPanel({ sessionId, onChartGenerated }: AIChatPanelProps) {
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const pendingQuery = useChatStore(state => state.pendingQuery);
  const setPendingQuery = useChatStore(state => state.setPendingQuery);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const executeQuery = useCallback(async (query: string) => {
    if (!query.trim() || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', content: query }]);
    setIsLoading(true);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query,
          session_id: sessionId
        })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.detail || 'Failed to get answer');
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer, reasoning: data.reasoning }]);
      
      if (data.chart_suggestion && data.chart_data && data.chart_data.length > 0) {
        onChartGenerated(data.chart_suggestion, data.chart_data);
      } else {
        onChartGenerated("none", []);
      }
      
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errorMsg}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isLoading, onChartGenerated]);

  // Handle pending external queries (from Discovery cards)
  useEffect(() => {
    if (pendingQuery && !isLoading) {
      executeQuery(pendingQuery);
      setPendingQuery(null);
    }
  }, [pendingQuery, isLoading, executeQuery, setPendingQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const q = input.trim();
    setInput('');
    executeQuery(q);
  };

  return (
    <div className="bg-[#0B0F17]/40 backdrop-blur-md rounded-2xl border border-[rgba(148,163,184,0.1)] flex flex-col h-full min-h-[400px] lg:h-[700px] overflow-hidden shadow-2xl animate-in fade-in duration-500">
      <div className="px-6 py-4 border-b border-[rgba(148,163,184,0.1)] flex items-center justify-between bg-[#0B0F17]/20">
        <div className="flex items-center space-x-4">
          <div className="p-2.5 bg-[rgba(0,229,255,0.1)] text-[#00E5FF] rounded-xl border border-[rgba(0,229,255,0.2)] shadow-[0_0_15px_rgba(0,229,255,0.1)]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-[#F1F5F9] tracking-tight text-sm sm:text-base">Ask InsightAI</h3>
            <p className="text-[10px] sm:text-xs text-[#64748B] font-medium">Neural Data Exploration Engine</p>
          </div>
        </div>
        {isLoading && <Loader2 className="w-4 h-4 text-[#00E5FF] animate-spin" />}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar bg-[rgba(15,23,42,0.2)]">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 bg-[#121926] border border-[rgba(148,163,184,0.1)] rounded-full flex items-center justify-center shadow-inner mb-6">
              <Bot className="w-8 h-8 text-[#00E5FF] opacity-50" />
            </div>
            <p className="text-[#94A3B8] font-medium text-lg">Ready for analysis.</p>
            <p className="text-xs text-[#475569] mt-2 max-w-[240px]">Ask about trends, correlations, or specific metrics in your dataset.</p>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div key={i} className={`flex w-full animate-in slide-in-from-bottom-2 duration-300 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex space-x-3 max-w-[90%] sm:max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg border ${
                msg.role === 'user' 
                  ? 'bg-[#121926] border-[rgba(148,163,184,0.2)]' 
                  : 'bg-gradient-to-br from-[#00E5FF]/20 to-[#7000FF]/20 border-[rgba(0,229,255,0.3)] text-[#00E5FF]'
              }`}>
                {msg.role === 'user' ? <User className="w-4 h-4 text-[#64748B]" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`p-4 text-sm leading-relaxed shadow-xl border flex flex-col ${
                msg.role === 'user' 
                  ? 'bg-[#1E293B] text-[#F1F5F9] rounded-2xl rounded-tr-sm border-[rgba(148,163,184,0.2)]' 
                  : 'bg-[#0F172A] text-[#94A3B8] rounded-2xl rounded-tl-sm border-[rgba(148,163,184,0.1)]'
              }`}>
                {msg.reasoning && (
                  <details className="group [&_summary::-webkit-details-marker]:hidden bg-[#121926]/50 rounded-xl border border-[rgba(148,163,184,0.1)] p-3 mb-3 cursor-pointer">
                    <summary className="flex items-center text-[10px] font-bold text-[#475569] group-hover:text-[#00E5FF] uppercase tracking-wider outline-none select-none">
                      <Lightbulb className="w-3 h-3 mr-2" />
                      Execution Logic
                      <ChevronDown className="w-3 h-3 ml-auto text-[#475569] group-open:rotate-180 transition-transform duration-300" />
                    </summary>
                    <div className="mt-3 text-[11px] text-[#64748B] font-mono whitespace-pre-wrap border-t border-[rgba(148,163,184,0.1)] pt-3 leading-relaxed">
                      {msg.reasoning}
                    </div>
                  </details>
                )}
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start w-full animate-in fade-in duration-300">
            <div className="flex space-x-3 max-w-[85%]">
              <div className="w-8 h-8 rounded-full bg-[#0F172A] border border-[rgba(0,229,255,0.2)] text-[#00E5FF] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="px-5 py-4 rounded-2xl bg-[#0F172A]/50 border border-[rgba(148,163,184,0.1)] flex items-center space-x-2 rounded-tl-sm h-11">
                <div className="w-1 h-1 rounded-full bg-[#00E5FF] animate-bounce"></div>
                <div className="w-1 h-1 rounded-full bg-[#00E5FF] animate-bounce" style={{animationDelay: '0.2s'}}></div>
                <div className="w-1 h-1 rounded-full bg-[#00E5FF] animate-bounce" style={{animationDelay: '0.4s'}}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
<div className="p-4 sm:p-5 bg-[#0B0F17]/60 backdrop-blur-xl border-t border-[rgba(148,163,184,0.1)]">
        <form onSubmit={handleSubmit} className="flex relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Analyze data patterns..."
            className="flex-1 pl-5 pr-14 py-3.5 bg-[#121926] border border-[rgba(148,163,184,0.2)] rounded-2xl focus:outline-none focus:ring-1 focus:ring-[#00E5FF]/30 focus:border-[#00E5FF]/50 transition-all text-[#F1F5F9] text-sm shadow-inner placeholder:text-[#475569]"
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 top-1.5 p-2.5 bg-[#00E5FF] text-white rounded-xl hover:bg-[#00D0E6] disabled:opacity-20 disabled:grayscale transition-all shadow-[0_0_15px_rgba(0,229,255,0.2)] active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
