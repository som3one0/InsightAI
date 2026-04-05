"use client";
import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Loader2, Sparkles, RefreshCw } from 'lucide-react';

interface ProcessingStatus {
  cleaned: boolean;
  transformed: boolean;
  enriched: boolean;
}

interface DataProcessingIndicatorProps {
  sessionId: string;
}

export default function DataProcessingIndicator({ sessionId }: DataProcessingIndicatorProps) {
  const [status, setStatus] = useState<ProcessingStatus>({
    cleaned: false,
    transformed: false,
    enriched: false
  });
  const [loading, setLoading] = useState(true);
  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [mode, setMode] = useState<string>('balanced');

  useEffect(() => {
    if (!sessionId) return;
    
    async function fetchCleaningStatus() {
      try {
        const resp = await fetch(`http://127.0.0.1:8000/api/cleaning-report/${sessionId}`);
        if (!resp.ok) return;
        
        const data = await resp.json();
        
        if (data.status === 'success') {
          setStatus({
            cleaned: true,
            transformed: data.transformations > 0,
            enriched: data.enrichment > 0
          });
          setQualityScore(data.quality_score);
          setMode(data.cleaning_mode);
        }
      } catch (e) {
        console.error('Failed to fetch cleaning status', e);
      } finally {
        setLoading(false);
      }
    }
    
    fetchCleaningStatus();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[rgba(0,229,255,0.05)] border border-[rgba(0,229,255,0.15)] rounded-lg">
        <Loader2 className="w-3.5 h-3.5 text-[#00E5FF] animate-spin" />
        <span className="text-[11px] text-[#64748B]">Processing data...</span>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[#10B981]';
    if (score >= 60) return 'text-[#F59E0B]';
    return 'text-[#F43F5E]';
  };

  const getModeLabel = (m: string) => {
    switch (m) {
      case 'conservative': return 'Conservative';
      case 'aggressive': return 'Aggressive';
      default: return 'Balanced';
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Processing Steps */}
      <div className="flex items-center gap-1.5">
        {status.cleaned ? (
          <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
        ) : (
          <Circle className="w-4 h-4 text-[#475569]" />
        )}
        <span className={`text-[10px] ${status.cleaned ? 'text-[#10B981]' : 'text-[#475569]'}`}>
          Cleaned
        </span>
      </div>
      
      <span className="text-[#475569]">•</span>
      
      <div className="flex items-center gap-1.5">
        {status.transformed ? (
          <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
        ) : (
          <Circle className="w-4 h-4 text-[#475569]" />
        )}
        <span className={`text-[10px] ${status.transformed ? 'text-[#10B981]' : 'text-[#475569]'}`}>
          Transformed
        </span>
      </div>
      
      <span className="text-[#475569]">•</span>
      
      <div className="flex items-center gap-1.5">
        {status.enriched ? (
          <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
        ) : (
          <Circle className="w-4 h-4 text-[#475569]" />
        )}
        <span className={`text-[10px] ${status.enriched ? 'text-[#10B981]' : 'text-[#475569]'}`}>
          Enriched
        </span>
      </div>

      {/* Quality Score Badge */}
      {qualityScore !== null && (
        <>
          <span className="text-[#475569]">•</span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[rgba(0,229,255,0.1)] rounded">
            <Sparkles className="w-3 h-3 text-[#00E5FF]" />
            <span className={`text-[10px] font-medium ${getScoreColor(qualityScore)}`}>
              {qualityScore.toFixed(0)}/100
            </span>
          </div>
        </>
      )}

      {/* Mode Badge */}
      <div className="text-[10px] text-[#64748B] bg-[#0A0F1C] px-2 py-0.5 rounded border border-[rgba(148,163,184,0.1)]">
        {getModeLabel(mode)} Mode
      </div>
    </div>
  );
}