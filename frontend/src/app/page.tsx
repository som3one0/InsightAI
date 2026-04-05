"use client";

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import FileUpload from '@/components/FileUpload';
import InsightsPanel from '@/components/InsightsPanel';
import ChatBox from '@/components/ChatBox';
import QueryBuilder from '@/components/QueryBuilder';
import DataExplorer from '@/components/DataExplorer';
import AIInsightsPanel from '@/components/AIInsightsPanel';
import DataProcessingIndicator from '@/components/DataProcessingIndicator';
import ProcessingLogPanel from '@/components/ProcessingLogPanel';
import Dashboard from '@/components/Dashboard';
import axios from 'axios';
import { Brain, BarChart3, Database, Sparkles, Loader2 } from 'lucide-react';

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'hub' | 'chat' | 'data' | 'insights'>('hub');
  const [sessions, setSessions] = useState<any[]>([]);
  const [externalQuery, setExternalQuery] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => { 
    fetchSessions(); 
    if (sessionStorage.getItem('showUpload') === 'true') {
      setShowUpload(true);
      sessionStorage.removeItem('showUpload');
    }
    if (sessionStorage.getItem('showHub') === 'true') {
      setViewMode('hub');
      sessionStorage.removeItem('showHub');
    }
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/sessions');
      setSessions(res.data.sessions);
    } catch (err) { console.error("Failed to fetch sessions", err); }
  };

  const handleUploadSuccess = (sid: string, meta: any, insights?: string) => {
    setSessionId(sid);
    setShowUpload(false);
    if (meta) setMetadata(meta);
    // Don't go to chat - user can switch manually or we'll show dashboard
    setViewMode('chat');
    fetchSessions();
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1500);
  };

  const handleNewDataSource = () => {
    setSessionId(null);
    setMetadata(null);
    setShowUpload(true);
  };

  const handleSessionSelect = async (sid: string) => {
    try {
      const res = await axios.get(`http://127.0.0.1:8000/api/sessions/${sid}`);
      setSessionId(sid);
      setShowUpload(false);
      setMetadata(res.data.session.metadata);
      setViewMode('chat');
    } catch (err) { console.error("Failed to load session", err); }
  };

  const tabs = [
    { id: 'hub' as const, label: 'Executive Hub', icon: BarChart3 },
    { id: 'chat' as const, label: 'Chat', icon: Brain },
    { id: 'data' as const, label: 'Data', icon: Database },
    { id: 'insights' as const, label: 'AI Insights', icon: Sparkles },
  ];

  const shouldShowUpload = showUpload || (!sessionId && sessions.length === 0);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      
      <div className="relative flex h-screen">
        <Sidebar
          sessions={sessions}
          currentSessionId={sessionId}
          onSelectSession={handleSessionSelect}
          onRefreshSessions={fetchSessions}
        />

        <main className="lg:ml-64 flex-1 flex flex-col h-screen overflow-hidden overflow-y-auto">
          {shouldShowUpload && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 py-20">
              <div className="w-full max-w-4xl space-y-12 stagger-children">
                <div className="text-center space-y-6">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-[rgba(0,229,255,0.05)] border border-[rgba(0,229,255,0.1)] mb-4 relative group">
                    <div className="absolute inset-0 bg-[#00E5FF] blur-2xl opacity-10 group-hover:opacity-20 transition-opacity" />
                    <Sparkles className="w-12 h-12 text-[#00E5FF] relative z-10 animate-pulse-glow rounded-full p-2" />
                  </div>
                  <h1 className="text-6xl font-extrabold tracking-tighter">
                    <span className="text-white">Experience </span>
                    <span className="text-gradient-cyan">InsightAI</span>
                  </h1>
                  <p className="text-[#94A3B8] text-lg max-w-2xl mx-auto leading-relaxed">
                    The autonomous agent for deep data exploration. Upload your datasets and let AI handle the heavy lifting of cleaning, enrichment, and proactive discovery.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-premium p-6 card-lift space-y-4">
                    <div className="w-10 h-10 rounded-xl bg-[rgba(0,229,255,0.1)] flex items-center justify-center">
                      <Brain className="w-5 h-5 text-[#00E5FF]" />
                    </div>
                    <h3 className="font-bold text-white">Autonomous Cleaning</h3>
                    <p className="text-xs text-[#64748B] leading-relaxed">AI automatically detects types, fixes missing values, and standardizes formats without user input.</p>
                  </div>
                  <div className="glass-premium p-6 card-lift space-y-4">
                    <div className="w-10 h-10 rounded-xl bg-[rgba(139,92,246,0.1)] flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-[#8B5CF6]" />
                    </div>
                    <h3 className="font-bold text-white">Smart Discovery</h3>
                    <p className="text-xs text-[#64748B] leading-relaxed">Proactive insights and "discovery cards" that reveal trends you didn't even think to ask about.</p>
                  </div>
                  <div className="glass-premium p-6 card-lift space-y-4">
                    <div className="w-10 h-10 rounded-xl bg-[rgba(16,185,129,0.1)] flex items-center justify-center">
                      <Database className="w-5 h-5 text-[#10B981]" />
                    </div>
                    <h3 className="font-bold text-white">Executive Reports</h3>
                    <p className="text-xs text-[#64748B] leading-relaxed">Generate comprehensive markdown reports and visual dashboards with a single natural language query.</p>
                  </div>
                </div>
                <div className="max-w-md mx-auto pt-8">
                  <FileUpload onUploadSuccess={handleUploadSuccess} />
                  <p className="text-center text-[10px] text-[#475569] mt-6 uppercase tracking-[0.2em] font-bold">
                    Supported formats: CSV, Excel (.xlsx, .xls)
                  </p>
                </div>
              </div>
            </div>
          )}

          {!shouldShowUpload && !sessionId && sessions.length > 0 && (
            <Dashboard 
              onSelectSession={handleSessionSelect} 
              onRefresh={fetchSessions} 
            />
          )}

          {sessionId && !showUpload && (
            <>
              <div className="h-14 border-b border-[rgba(148,163,184,0.1)] glass-premium flex items-center px-6 shrink-0">
                <div className="flex items-center gap-1">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = viewMode === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setViewMode(tab.id)}
                        className={`tab-cyber flex items-center gap-2 ${isActive ? 'active' : ''}`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[#00E5FF]' : ''}`} />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
                
                <div className="flex-1" />
                {sessionId && <DataProcessingIndicator sessionId={sessionId} />}
                
                {metadata && (
                  <div className="hidden md:flex items-center gap-4 text-xs ml-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(0,229,255,0.08)] border border-[rgba(0,229,255,0.15)]">
                      <Database className="w-3.5 h-3.5 text-[#00E5FF]" />
                      <span className="text-[#94A3B8]">{metadata.total_rows?.toLocaleString()}</span>
                      <span className="text-[#64748B]">rows</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(139,92,246,0.08)] border border-[rgba(139,92,246,0.15)]">
                      <BarChart3 className="w-3.5 h-3.5 text-[#8B5CF6]" />
                      <span className="text-[#94A3B8]">{metadata.columns?.length}</span>
                      <span className="text-[#64748B]">columns</span>
                    </div>
                  </div>
                )}
              </div>

              {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <Loader2 className="w-10 h-10 text-[#00E5FF] animate-spin mx-auto" />
                    <p className="text-[#64748B] text-sm">Analyzing your data...</p>
                  </div>
                </div>
              ) : viewMode === 'chat' ? (
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                  <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex justify-end px-4 pt-3 shrink-0">
                      {metadata && (
                        <QueryBuilder
                          metadata={metadata}
                          sessionId={sessionId}
                          onExecuteQuery={(q) => setExternalQuery(q)}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-h-0">
                      <ChatBox
                        sessionId={sessionId}
                        externalQuery={externalQuery}
                        onQuerySubmitted={() => setExternalQuery(undefined)}
                      />
                    </div>
                  </div>
                  <div className="hidden lg:flex w-80 border-l border-[rgba(148,163,184,0.1)] glass-premium overflow-hidden flex-col translate-x-0 transition-all duration-300">
                    <div className="shrink-0">
                      <ProcessingLogPanel sessionId={sessionId} />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <InsightsPanel sessionId={sessionId} />
                    </div>
                  </div>
                </div>
              ) : viewMode === 'hub' ? (
                <Dashboard 
                  onSelectSession={(sid) => {
                    handleSessionSelect(sid);
                    setViewMode('chat');
                  }} 
                  onRefresh={fetchSessions} 
                />
              ) : viewMode === 'insights' ? (
                <div className="flex-1 overflow-hidden">
                  <AIInsightsPanel 
                    sessionId={sessionId} 
                    onViewChat={() => setViewMode('chat')}
                    onSetQuery={(q: string) => setExternalQuery(q)}
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="max-w-6xl mx-auto">
                    {metadata && <DataExplorer metadata={metadata} sessionId={sessionId} />}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}