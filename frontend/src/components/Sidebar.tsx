"use client";
import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, FileText, Trash2, Database, Brain, Sparkles, 
  MoreVertical, Edit2, Copy, Download, History, FileDown,
  X, Check, AlertCircle, Loader2, CheckSquare, Square, Menu, BarChart3
} from 'lucide-react';
import axios from 'axios';
import { useChatStore } from '../store/chatStore';

interface SidebarProps {
  sessions: any[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onRefreshSessions: () => void;
}

export default function Sidebar({ sessions, currentSessionId, onSelectSession, onRefreshSessions }: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmingAction, setConfirmingAction] = useState<{id: string | string[], type: 'delete' | 'clear' | 'bulk_delete' | null}>({id: '', type: null});
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  
  const removeSessionFromStore = useChatStore(state => state.removeSession);
  const renameSessionInStore = useChatStore(state => state.renameSession);
  const bulkRemoveSessionsFromStore = useChatStore(state => state.bulkRemoveSessions);
  
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRename = async (sessionId: string) => {
    if (!newName.trim()) return;
    setIsProcessing(true);
    try {
      await axios.patch(`http://127.0.0.1:8000/api/sessions/${sessionId}`, { new_name: newName });
      renameSessionInStore(sessionId, newName);
      onRefreshSessions();
      setRenamingId(null);
    } catch (err) {
      console.error('Failed to rename session', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDuplicate = async (sessionId: string) => {
    setIsProcessing(true);
    setMenuOpen(null);
    try {
      await axios.post(`http://127.0.0.1:8000/api/sessions/${sessionId}/duplicate`);
      onRefreshSessions();
    } catch (err) {
      console.error('Failed to duplicate session', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearHistory = async (sessionId: string) => {
    setIsProcessing(true);
    try {
      await axios.delete(`http://127.0.0.1:8000/api/sessions/${sessionId}/history`);
      // Update local store: clear messages for this session
      useChatStore.getState().setMessages(
        useChatStore.getState().messages.filter(m => m.sessionId !== sessionId)
      );
      setConfirmingAction({id: '', type: null});
      setMenuOpen(null);
    } catch (err) {
      console.error('Failed to clear history', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setIsProcessing(true);
    try {
      await axios.delete(`http://127.0.0.1:8000/api/sessions/${sessionId}`);
      removeSessionFromStore(sessionId);
      onRefreshSessions();
      if (currentSessionId === sessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId);
        if (remaining.length > 0) onSelectSession(remaining[0].id);
        else window.location.href = '/';
      }
      setConfirmingAction({id: '', type: null});
      setMenuOpen(null);
    } catch (err) {
      console.error('Failed to delete session', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    try {
      const idsToDelete = Array.isArray(confirmingAction.id) ? confirmingAction.id : [confirmingAction.id as string];
      await axios.delete('http://127.0.0.1:8000/api/sessions/bulk', { 
        data: { session_ids: idsToDelete } 
      });
      bulkRemoveSessionsFromStore(idsToDelete);
      onRefreshSessions();
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      setConfirmingAction({id: '', type: null});
      
      // If current session was deleted, redirect
      if (currentSessionId && idsToDelete.includes(currentSessionId)) {
        const remaining = sessions.filter(s => !idsToDelete.includes(s.id));
        if (remaining.length > 0) onSelectSession(remaining[0].id);
        else window.location.href = '/';
      }
    } catch (err) {
      console.error('Failed to delete sessions in bulk', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkExport = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    try {
      for (const id of Array.from(selectedIds)) {
        const session = sessions.find(s => s.id === id);
        if (session) {
          await handleDownloadCSV(session.id, session.filename);
          // Small delay to avoid browser blocking multiple downloads
          await new Promise(r => setTimeout(r, 300));
        }
      }
    } catch (err) {
      console.error('Failed to export sessions in bulk', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadCSV = async (sessionId: string, filename: string) => {
    setMenuOpen(null);
    try {
      const response = await axios.get(`http://127.0.0.1:8000/api/export/${sessionId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${filename}_export.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to download CSV', err);
    }
  };

  const handleDownloadReport = async (sessionId: string, filename: string) => {
    setMenuOpen(null);
    try {
      const response = await axios.get(`http://127.0.0.1:8000/api/export/report/${sessionId}`);
      const blob = new Blob([response.data], { type: 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${filename}_report.md`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to download report', err);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return 'Recently'; }
  };

  useEffect(() => {
    setIsMobileOpen(false);
    
    // Fetch AI Suggestions when session changes
    if (currentSessionId) {
      setIsFetchingSuggestions(true);
      axios.get(`http://127.0.0.1:8000/api/ai/suggestions/${currentSessionId}`)
        .then(res => {
          setAiSuggestions(res.data.suggestions || []);
        })
        .catch(err => console.error("Failed to fetch suggestions", err))
        .finally(() => setIsFetchingSuggestions(false));
    } else {
      setAiSuggestions([]);
    }
  }, [currentSessionId]);

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Toggle Button (Floating) */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-4 left-4 z-[70] p-2 bg-[#121926] border border-[rgba(148,163,184,0.2)] rounded-xl lg:hidden shadow-2xl text-[#00E5FF] active:scale-95 transition-transform"
      >
        <Menu className="w-5 h-5" />
      </button>

      <aside className={`fixed inset-y-0 left-0 z-[90] w-64 bg-[#0A0F1C] border-r border-[rgba(148,163,184,0.1)] flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static ${
        isMobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Header */}
        <div className="p-4 border-b border-[rgba(148,163,184,0.1)] shrink-0 bg-[#0A0F1C]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-xl bg-gradient-to-br from-[#00E5FF] to-[#10B981] shadow-[0_0_15px_rgba(0,229,255,0.3)]">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white tracking-tight uppercase">Analyst Pro</h1>
                <p className="text-[9px] text-[#00E5FF] font-bold tracking-tighter opacity-70">SaaS CORE v2.1</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsMobileOpen(false)}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-white lg:hidden"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-[9px] text-[#475569] -mt-0.5">Professional Edition</p>
        </div>

        {/* New Session */}
        <div className="p-4 space-y-4">
          <button
            onClick={() => {
              sessionStorage.setItem('showUpload', 'true');
              window.location.href = '/';
            }}
            className="w-full btn-cyber flex items-center justify-center gap-2 py-2.5 text-sm"
          >
            <Plus className="w-4 h-4" />
            New Data Source
          </button>
          
          <button
            onClick={() => {
              sessionStorage.setItem('showHub', 'true');
              window.location.href = '/';
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-xl border border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.05)] text-[#8B5CF6] hover:bg-[rgba(139,92,246,0.1)] hover:border-[rgba(139,92,246,0.3)] transition-all"
          >
            <BarChart3 className="w-4 h-4" />
            Executive Hub
          </button>

          {/* AI Discovery Cards */}
          {currentSessionId && aiSuggestions.length > 0 && (
            <div className="space-y-2 animate-in fade-in slide-in-from-left-4 duration-500 delay-150">
              <div className="flex items-center gap-2 px-1">
                <Sparkles className="w-3 h-3 text-[#00E5FF]" />
                <p className="text-[10px] font-bold text-[#475569] uppercase tracking-widest">Smart Discovery</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {aiSuggestions.slice(0, 3).map((suggestion: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => {
                        const query = typeof suggestion === 'string' ? suggestion : (suggestion.query || '');
                        if (query) {
                            useChatStore.getState().setPendingQuery?.(query);
                        }
                    }}
                    className="text-left p-2.5 rounded-xl bg-[rgba(0,229,255,0.03)] border border-[rgba(0,229,255,0.1)] hover:border-[rgba(0,229,255,0.3)] hover:bg-[rgba(0,229,255,0.06)] transition-all group"
                  >
                    <p className="text-[10px] text-[#94A3B8] group-hover:text-[#00E5FF] leading-relaxed line-clamp-2">
                      {typeof suggestion === 'string' ? suggestion : (suggestion.title || suggestion.description || suggestion.query || '')}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sessions */}
        <div className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
          <div className="flex items-center justify-between px-3 mb-3">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold text-[#475569] uppercase tracking-widest">Active Datasets</p>
              {sessions.length > 0 && (
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => {
                      setIsSelectionMode(!isSelectionMode);
                      setSelectedIds(new Set());
                    }}
                    className={`text-[9px] px-2 py-0.5 rounded-md transition-all ${
                      isSelectionMode 
                        ? 'bg-[rgba(244,63,94,0.1)] text-[#F43F5E] border border-[rgba(244,63,94,0.2)]' 
                        : 'bg-[rgba(148,163,184,0.1)] text-[#64748B] border border-transparent hover:border-[rgba(148,163,184,0.3)]'
                    }`}
                  >
                    {isSelectionMode ? 'Cancel' : 'Select'}
                  </button>
                  {isSelectionMode && (
                    <>
                      <button 
                        onClick={() => setSelectedIds(new Set(sessions.map(s => s.id)))}
                        className="text-[9px] px-2 py-0.5 rounded-md bg-[rgba(148,163,184,0.1)] text-[#94A3B8] border border-transparent hover:border-[rgba(148,163,184,0.3)] transition-all"
                      >
                        All
                      </button>
                      <button 
                        onClick={() => setSelectedIds(new Set())}
                        className="text-[9px] px-2 py-0.5 rounded-md bg-[rgba(148,163,184,0.1)] text-[#94A3B8] border border-transparent hover:border-[rgba(148,163,184,0.3)] transition-all"
                      >
                        None
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="h-[1px] flex-1 bg-[rgba(148,163,184,0.1)] ml-3" />
          </div>
          
          <div className="space-y-1.5">
            {sessions.map((session) => {
              const isActive = currentSessionId === session.id;
              const isRenaming = renamingId === session.id;
              const isMenuOpen = menuOpen === session.id;
              
              return (
                <div key={session.id} className="relative">
                  {isRenaming ? (
                    <div className="flex items-center gap-2 p-2 bg-[rgba(0,229,255,0.05)] border border-[rgba(0,229,255,0.2)] rounded-xl animate-in fade-in zoom-in duration-200">
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onBlur={() => !isProcessing && setRenamingId(null)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename(session.id)}
                        className="bg-transparent text-xs text-[#00E5FF] outline-none flex-1 min-w-0"
                      />
                      <button onClick={() => handleRename(session.id)} className="text-[#00E5FF] hover:scale-110 transition-transform">
                        {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ) : (
                    <div className="group relative">
                      <div
                        onClick={(e) => {
                          if (isSelectionMode) {
                            e.stopPropagation();
                            toggleSelection(session.id);
                          } else {
                            onSelectSession(session.id);
                          }
                        }}
                        className={`w-full flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                          isActive && !isSelectionMode
                            ? 'bg-[rgba(0,229,255,0.08)] border border-[rgba(0,229,255,0.2)] shadow-[0_0_15px_rgba(0,229,255,0.05)]' 
                            : isSelectionMode && selectedIds.has(session.id)
                              ? 'bg-[rgba(244,63,94,0.05)] border border-[rgba(244,63,94,0.2)]'
                              : 'hover:bg-[rgba(148,163,184,0.05)] border border-transparent'
                        }`}
                      >
                        {isSelectionMode ? (
                          <div className="shrink-0 mt-0.5">
                            {selectedIds.has(session.id) ? (
                              <CheckSquare className="w-4 h-4 text-[#F43F5E]" />
                            ) : (
                              <Square className="w-4 h-4 text-[#475569]" />
                            )}
                          </div>
                        ) : (
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isActive ? 'bg-[rgba(0,229,255,0.15)] shadow-inner' : 'bg-[rgba(148,163,184,0.08)]'
                          }`}>
                            <Database className={`w-3.5 h-3.5 ${isActive ? 'text-[#00E5FF]' : 'text-[#64748B]'}`} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 text-left">
                          <p className={`text-xs font-semibold truncate ${isActive && !isSelectionMode ? 'text-white' : 'text-[#94A3B8]'}`}>
                            {session.filename}
                          </p>
                          <p className="text-[10px] text-[#475569] mt-0.5 font-medium">
                            {formatDate(session.created_at)}
                          </p>
                        </div>
                        
                        {!isSelectionMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpen(isMenuOpen ? null : session.id);
                            }}
                            className={`p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 ${
                              isMenuOpen ? 'opacity-100 bg-[rgba(148,163,184,0.1)]' : 'hover:bg-[rgba(148,163,184,0.1)]'
                            }`}
                          >
                            <MoreVertical className="w-3.5 h-3.5 text-[#64748B]" />
                          </button>
                        )}
                      </div>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <div 
                          ref={menuRef}
                          className="absolute right-0 top-12 w-48 py-1.5 bg-[#121926] border border-[rgba(148,163,184,0.2)] rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-1 duration-200"
                        >
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingId(session.id);
                              setNewName(session.filename);
                              setMenuOpen(null);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-[#94A3B8] hover:text-[#00E5FF] hover:bg-[rgba(0,229,255,0.05)] transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Rename Dataset
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDuplicate(session.id); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-[#94A3B8] hover:text-[#00E5FF] hover:bg-[rgba(0,229,255,0.05)] transition-all"
                          >
                            <Copy className="w-3.5 h-3.5" /> Duplicate Analysis
                          </button>
                          <div className="h-[1px] bg-[rgba(148,163,184,0.1)] my-1" />
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDownloadCSV(session.id, session.filename); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-[#94A3B8] hover:text-white hover:bg-[rgba(148,163,184,0.05)] transition-all"
                          >
                            <FileDown className="w-3.5 h-3.5" /> Export Clean CSV
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDownloadReport(session.id, session.filename); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-[#94A3B8] hover:text-white hover:bg-[rgba(148,163,184,0.05)] transition-all"
                          >
                            <Download className="w-3.5 h-3.5" /> Executive Report (.md)
                          </button>
                          <div className="h-[1px] bg-[rgba(148,163,184,0.1)] my-1" />
                          <button 
                            onClick={(e) => { e.stopPropagation(); setConfirmingAction({id: session.id, type: 'clear'}); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-[#94A3B8] hover:text-[#FBBF24] hover:bg-[rgba(251,191,36,0.05)] transition-all"
                          >
                            <History className="w-3.5 h-3.5" /> Clear History
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setConfirmingAction({id: session.id, type: 'delete'}); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-[#F43F5E] hover:bg-[rgba(244,63,94,0.05)] transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Permanent Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {sessions.length === 0 && (
            <div className="text-center py-10 px-4">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(148,163,184,0.05)] border border-[rgba(148,163,184,0.1)] flex items-center justify-center mx-auto mb-4">
                <Brain className="w-6 h-6 text-[#475569]" />
              </div>
              <p className="text-xs font-semibold text-[#64748B]">No datasets yet</p>
              <p className="text-[10px] text-[#475569] mt-2 leading-relaxed">
                Upload a CSV file to begin your AI-powered exploration.
              </p>
            </div>
          )}
        </div>

        {/* Footer / Bulk Actions */}
        <div className="p-4 border-t border-[rgba(148,163,184,0.1)] bg-[#0A0F1C]/50 transition-all duration-300">
          {isSelectionMode && selectedIds.size > 0 ? (
            <div className="space-y-2 animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingAction({id: Array.from(selectedIds), type: 'bulk_delete'})}
                  disabled={isProcessing}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[10px] font-bold rounded-xl shadow-[0_0_20px_rgba(239,68,68,0.2)] flex items-center justify-center gap-1.5 transition-all"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete ({selectedIds.size})
                </button>
                <button
                  onClick={handleBulkExport}
                  disabled={isProcessing}
                  className="flex-1 py-2.5 bg-[#121926] hover:bg-[#1e293b] border border-[rgba(148,163,184,0.2)] text-[#94A3B8] text-[10px] font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                  Export
                </button>
              </div>
              <button
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedIds(new Set());
                }}
                className="w-full py-1 text-[10px] text-[#64748B] hover:text-white transition-colors"
                aria-label="Cancel Selection Mode"
              >
                Clear Selection
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2.5">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-[#10B981]" />
                <div className="w-2 h-2 rounded-full bg-[#10B981] absolute inset-0 animate-ping" />
              </div>
              <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">System Operational</p>
            </div>
          )}
        </div>

        {/* Global Actions - Bulk Export */}
        <div className="p-4 border-t border-[rgba(148,163,184,0.1)] space-y-3 bg-[#0A0F1C]/80">
          <button
            onClick={() => window.location.href = 'http://127.0.0.1:8000/api/export/bulk'}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[rgba(0,229,255,0.02)] border border-[rgba(255,255,255,0.05)] text-xs font-bold text-[#94A3B8] hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(0,229,255,0.3)] transition-all group"
          >
            <Download className="w-3.5 h-3.5 group-hover:text-[#00E5FF] transition-colors" />
            <span>Export All Data (ZIP)</span>
          </button>

          <div className="flex items-center justify-between px-2">
            <div className="text-[10px] text-[#475569] font-bold uppercase tracking-wider">Storage Health</div>
            <div className="text-[10px] text-[#22D3EE] font-bold">Optimal</div>
          </div>
        </div>
      </aside>

      {/* Confirmation Modal */}
      {confirmingAction.type && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isProcessing && setConfirmingAction({id: '', type: null})} />
          <div className="relative w-full max-w-sm bg-[#121926] border border-[rgba(148,163,184,0.2)] rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
              confirmingAction.type === 'delete' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
            }`}>
              <AlertCircle className="w-6 h-6" />
            </div>
            
            <h3 className="text-lg font-bold text-white mb-2">
              {confirmingAction.type === 'delete' ? 'Delete Dataset?' : 
               confirmingAction.type === 'bulk_delete' ? `Delete ${Array.isArray(confirmingAction.id) ? confirmingAction.id.length : 1} Datasets?` :
               'Clear History?'}
            </h3>
            <p className="text-sm text-[#94A3B8] mb-6 leading-relaxed">
              {confirmingAction.type === 'delete' || confirmingAction.type === 'bulk_delete'
                ? 'This action will permanently delete the selected dataset(s), all calculations, and chat history. This cannot be undone.' 
                : 'This will remove all chat messages for this analysis but keep the dataset and insights intact.'}
            </p>
            
            <div className="flex gap-3">
              <button 
                disabled={isProcessing}
                onClick={() => setConfirmingAction({id: '', type: null})}
                className="flex-1 py-2 text-sm font-medium text-[#94A3B8] hover:text-white bg-[rgba(148,163,184,0.1)] rounded-xl transition-all"
                aria-label="Cancel Delete"
              >
                Cancel
              </button>
              <button 
                disabled={isProcessing}
                onClick={() => {
                  if (confirmingAction.type === 'bulk_delete') handleBulkDelete();
                  else if (confirmingAction.type === 'delete') handleDeleteSession(confirmingAction.id as string);
                  else handleClearHistory(confirmingAction.id as string);
                }}
                className={`flex-1 py-2 text-sm font-bold text-white rounded-xl transition-all flex items-center justify-center gap-2 ${
                  confirmingAction.type === 'delete' || confirmingAction.type === 'bulk_delete' ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'bg-amber-500 hover:bg-amber-600 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                }`}
                aria-label="Confirm Action"
              >
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                {confirmingAction.type === 'delete' || confirmingAction.type === 'bulk_delete' ? 'Yes, Delete' : 'Yes, Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}