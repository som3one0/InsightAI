"use client";
import { useState, useEffect } from 'react';
import { FileText, Trash2, AlertTriangle, Sparkles, CheckCircle2, X, ChevronDown, ChevronUp } from 'lucide-react';

interface CleaningAction {
  action: string;
  column: string;
  details: string;
  affected: number;
}

interface ProcessingLogPanelProps {
  sessionId: string;
}

export default function ProcessingLogPanel({ sessionId }: ProcessingLogPanelProps) {
  const [actions, setActions] = useState<CleaningAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState({
    duplicates: 0,
    missing_handled: 0,
    outliers: 0,
    new_features: 0
  });

  useEffect(() => {
    if (!sessionId) return;
    
    async function fetchCleaningLog() {
      try {
        const resp = await fetch(`http://127.0.0.1:8000/api/cleaning-report/${sessionId}`);
        if (!resp.ok) return;
        
        const data = await resp.json();
        
        if (data.status === 'success' && data.actions_log) {
          setActions(data.actions_log);
          
          // Calculate stats
          const duplicates = data.actions_log.filter((a: CleaningAction) => a.action === 'REMOVE_DUPLICATES').reduce((sum: number, a: CleaningAction) => sum + a.affected, 0);
          const missing = data.actions_log.filter((a: CleaningAction) => a.action === 'IMPUTE_MISSING').reduce((sum: number, a: CleaningAction) => sum + a.affected, 0);
          const outliers = data.actions_log.filter((a: CleaningAction) => a.action.includes('OUTLIER')).reduce((sum: number, a: CleaningAction) => sum + a.affected, 0);
          
          setStats({
            duplicates,
            missing_handled: missing,
            outliers,
            new_features: data.new_features?.length || 0
          });
        }
      } catch (e) {
        console.error('Failed to fetch cleaning log', e);
      } finally {
        setLoading(false);
      }
    }
    
    fetchCleaningLog();
  }, [sessionId]);

  const getActionIcon = (action: string) => {
    if (action.includes('DUPLICATE')) return <Trash2 className="w-3.5 h-3.5 text-[#F59E0B]" />;
    if (action.includes('MISSING')) return <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />;
    if (action.includes('OUTLIER')) return <AlertTriangle className="w-3.5 h-3.5 text-[#F43F5E]" />;
    if (action.includes('NEW') || action.includes('CREATE')) return <Sparkles className="w-3.5 h-3.5 text-[#00E5FF]" />;
    return <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />;
  };

  const getSeverityColor = (action: string) => {
    if (action.includes('ERROR')) return 'border-l-[#F43F5E]';
    if (action.includes('WARNING')) return 'border-l-[#F59E0B]';
    return 'border-l-[#10B981]';
  };

  if (loading) {
    return (
      <div className="glass-premium p-3">
        <div className="flex items-center gap-2 text-[#64748B] text-xs">
          <div className="w-3 h-3 border border-[#64748B] border-t-transparent rounded-full animate-spin" />
          Loading processing log...
        </div>
      </div>
    );
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="glass-premium overflow-hidden">
      {/* Header - always visible */}
      <div 
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[rgba(0,229,255,0.05)] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#64748B]" />
          <span className="text-xs font-medium text-[#94A3B8]">Processing Log</span>
          <span className="text-[10px] text-[#475569] bg-[#0A0F1C] px-1.5 py-0.5 rounded">
            {actions.length} actions
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Stats badges */}
          {stats.duplicates > 0 && (
            <span className="text-[9px] text-[#F59E0B] flex items-center gap-1">
              <Trash2 className="w-2.5 h-2.5" />
              {stats.duplicates}
            </span>
          )}
          {stats.missing_handled > 0 && (
            <span className="text-[9px] text-[#F59E0B] flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              {stats.missing_handled}
            </span>
          )}
          {stats.new_features > 0 && (
            <span className="text-[9px] text-[#00E5FF] flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" />
              {stats.new_features}
            </span>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4 text-[#64748B]" /> : <ChevronDown className="w-4 h-4 text-[#64748B]" />}
        </div>
      </div>

      {/* Expandable log content */}
      {isOpen && (
        <div className="border-t border-[rgba(148,163,184,0.1)] max-h-64 overflow-y-auto">
          <div className="p-2 space-y-1">
            {actions.map((action, idx) => (
              <div 
                key={idx}
                className={`px-3 py-2 rounded-lg bg-[#0A0F1C]/50 border-l-2 ${getSeverityColor(action.action)} flex items-start gap-2`}
              >
                {getActionIcon(action.action)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-[#64748B]">{action.action.replace(/_/g, ' ')}</span>
                    {action.column !== 'ALL' && action.column !== 'MULTIPLE' && (
                      <span className="text-[9px] text-[#00E5FF] bg-[rgba(0,229,255,0.1)] px-1.5 py-0.5 rounded">
                        {action.column}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#94A3B8] mt-0.5 truncate">{action.details}</p>
                  {action.affected > 0 && (
                    <span className="text-[9px] text-[#475569]">{action.affected} rows affected</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}