"use client";

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ChartConfig {
  id?: string;
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'none';
  title: string;
  xAxis: string;
  yAxis: string;
  data: { name: string; value: number }[];
  colors: string[];
  showDataLabels: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  charts?: ChartConfig[];
  chartData?: { name: string; value: number }[];
  chartType?: string;
  resultTable?: Record<string, any>[];
  resultColumns?: string[];
  followUpQuestions?: string[];
  isSaved?: boolean;
  isReasoningExpanded?: boolean;
  timestamp: number;
  dataSource?: string;
  backendCalculations?: boolean;
  sessionId?: string;
}

export interface Insight {
  title: string;
  value: string;
  explanation: string;
  type: string;
  chart_type?: string;
  data?: Record<string, unknown>;
}

export interface SessionData {
  id: string;
  metadata: {
    total_rows?: number;
    columns?: string[];
    [key: string]: unknown;
  };
  insights: Insight[];
  aiInsights?: {
    insights: any[];
    aiMetadata?: any;
    generatedAt?: number;
  };
  aiMetadata?: {
    suggestions: any[];
    summary: any;
    enhanced: boolean;
  };
}

interface ChatStore {
  messages: ChatMessage[];
  currentSessionId: string | null;
  sessions: SessionData[];
  pendingQuery: string | null;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  clearMessages: () => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setCurrentSession: (sessionId: string | null) => void;
  getSessionMessages: (sessionId: string) => ChatMessage[];
  setSessions: (sessions: SessionData[]) => void;
  updateSession: (sessionId: string, updates: Partial<SessionData>) => void;
  addInsightToSession: (sessionId: string, insight: Insight) => void;
  setSessionInsights: (sessionId: string, insights: Insight[], aiMetadata?: any) => void;
  setSessionAiInsights: (sessionId: string, insights: any[], aiMetadata?: any) => void;
  getSessionAiInsights: (sessionId: string) => { insights: any[]; aiMetadata?: any; generatedAt?: number } | null;
  removeSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newName: string) => void;
  bulkRemoveSessions: (sessionIds: string[]) => void;
  setPendingQuery: (query: string | null) => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messages: [],
      currentSessionId: null,
      sessions: [],
      pendingQuery: null,
      
      addMessage: (msg) =>
        set((state) => ({
          messages: [...state.messages, msg],
        })),
      
      setMessages: (msgs) =>
        set(() => ({
          messages: msgs,
        })),
      
      clearMessages: () =>
        set(() => ({
          messages: [],
        })),
      
      updateMessage: (id, updates) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),
      
      setCurrentSession: (sessionId) =>
        set(() => ({
          currentSessionId: sessionId,
        })),
      
      getSessionMessages: (sessionId) => {
        const state = get();
        return state.messages.filter(m => m.sessionId === sessionId);
      },

      setSessions: (sessions) =>
        set(() => ({
          sessions: sessions,
        })),
      
      updateSession: (sessionId, updates) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, ...updates } : s
          ),
        })),
      
       addInsightToSession: (sessionId, insight) =>
         set((state) => ({
           sessions: state.sessions.map((s) =>
             s.id === sessionId
               ? { ...s, insights: [...s.insights, insight] }
               : s
           ),
         })),
      setSessionInsights: (sessionId, insights, aiMetadata) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, insights, aiMetadata } : s
          ),
        })),
      
      setSessionAiInsights: (sessionId, insights, aiMetadata) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId 
              ? { 
                  ...s, 
                  aiInsights: { 
                    insights, 
                    aiMetadata, 
                    generatedAt: Date.now() 
                  } 
                } 
              : s
          ),
        })),
      
      getSessionAiInsights: (sessionId) => {
        const state = get();
        const session = state.sessions.find(s => s.id === sessionId);
        return session?.aiInsights || null;
      },
      
      removeSession: (sessionId) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
          messages: state.messages.filter((m) => m.sessionId !== sessionId),
          currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
        })),

      bulkRemoveSessions: (sessionIds) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => !sessionIds.includes(s.id)),
          messages: state.messages.filter((m) => !m.sessionId || !sessionIds.includes(m.sessionId)),
          currentSessionId: (state.currentSessionId && sessionIds.includes(state.currentSessionId)) ? null : state.currentSessionId,
        })),

      renameSession: (sessionId, newName) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, metadata: { ...s.metadata, filename: newName } } : s
          ),
        })),

      setPendingQuery: (query) =>
        set(() => ({
            pendingQuery: query,
        })),
    }),
    {
      name: 'insightai-chat-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ 
        messages: state.messages.slice(-100),
        sessions: state.sessions.slice(-50),
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);