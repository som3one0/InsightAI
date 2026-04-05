"use client";
import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Loader2, Shield, Zap, Crosshair, Database, Sparkles } from 'lucide-react';

interface FileUploadProps {
  onUploadSuccess: (session_id: string, metadata: any, insights: string) => void;
}

type CleaningMode = 'conservative' | 'balanced' | 'aggressive';

const cleaningModeDetails = {
  conservative: {
    title: 'Preserve Original Data',
    operations: ['Keep all rows intact', 'Minimal type inference', 'No outlier removal', 'Preserve nulls where possible'],
    impact: 'Est. 0-2% rows affected'
  },
  balanced: {
    title: 'Smart Defaults',
    operations: ['Remove duplicates', 'Fill nulls with median/mode', 'Standardize formats', 'Detect outliers (2σ)'],
    impact: 'Est. 3-10% rows affected'
  },
  aggressive: {
    title: 'Thorough Cleaning',
    operations: ['Remove outliers (>3σ)', 'Aggressive null handling', 'Drop low-variance columns', 'Advanced type conversion'],
    impact: 'Est. 5-15% rows affected'
  }
};

export default function FileUpload({ onUploadSuccess }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [cleaningMode, setCleaningMode] = useState<CleaningMode>('balanced');
  const [showModeDetails, setShowModeDetails] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("cleaning_mode", cleaningMode);

    try {
      const resp = await fetch('http://127.0.0.1:8000/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) throw new Error("Upload Failed");
      const data = await resp.json();
      onUploadSuccess(data.session_id, data.metadata, data.insights);
    } catch {
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleLoadSample = async () => {
    setIsLoadingSample(true);
    try {
      const formData = new FormData();
      formData.append('cleaning_mode', cleaningMode);

      const resp = await fetch(`http://127.0.0.1:8000/api/sample-data`, {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) throw new Error("Failed to load sample data");
      const data = await resp.json();
      onUploadSuccess(data.session_id, data.metadata, data.insights);
    } catch {
      alert("Failed to load sample data. Please try again.");
    } finally {
      setIsLoadingSample(false);
    }
  };

  const modes: { value: CleaningMode; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: 'conservative', label: 'Conservative', icon: <Shield className="w-4 h-4" />, desc: 'Preserve original data, minimal changes' },
    { value: 'balanced', label: 'Balanced', icon: <Zap className="w-4 h-4" />, desc: 'Smart defaults, moderate cleaning' },
    { value: 'aggressive', label: 'Aggressive', icon: <Crosshair className="w-4 h-4" />, desc: 'Thorough cleaning, remove all anomalies' },
  ];

  return (
    <div className="space-y-4">
      {/* Cleaning Mode Selector */}
      <div className="glass-premium p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-[#64748B] uppercase tracking-wider">Data Cleaning Mode</p>
          <button
            onClick={() => setShowModeDetails(!showModeDetails)}
            className="text-[10px] text-[#00E5FF] hover:underline"
          >
            {showModeDetails ? 'Hide details' : 'Show details'}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {modes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setCleaningMode(mode.value)}
              disabled={isUploading || isLoadingSample}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all relative ${
                cleaningMode === mode.value
                  ? 'bg-[rgba(0,229,255,0.1)] border-[rgba(0,229,255,0.3)] text-[#00E5FF]'
                  : 'bg-[#0A0F1C] border-[rgba(148,163,184,0.1)] text-[#64748B] hover:border-[rgba(0,229,255,0.2)]'
              }`}
            >
              {mode.icon}
              <span className="text-[11px] font-medium">{mode.label}</span>
              <span className="text-[9px] opacity-70 text-center">{mode.desc}</span>
              {cleaningMode === mode.value && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#00E5FF] rounded-full animate-pulse" />
              )}
            </button>
          ))}
        </div>
        
        {/* Mode Details Panel */}
        {showModeDetails && (
          <div className="mt-3 p-3 bg-[#0A0F1C] rounded-xl border border-[rgba(148,163,184,0.1)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#00E5FF]">{cleaningModeDetails[cleaningMode].title}</span>
              <span className="text-[10px] text-[#64748B]">{cleaningModeDetails[cleaningMode].impact}</span>
            </div>
            <ul className="space-y-1">
              {cleaningModeDetails[cleaningMode].operations.map((op, i) => (
                <li key={i} className="text-[10px] text-[#94A3B8] flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#00E5FF]" />
                  {op}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Upload Area */}
      <div className="flex gap-3">
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOver(false); }}
          className={`relative group cursor-pointer transition-all duration-300 rounded-2xl border-2 border-dashed p-8 text-center flex-1 ${
            isDragOver 
              ? 'border-[#00E5FF] bg-[rgba(0,229,255,0.05)]' 
              : 'border-[rgba(148,163,184,0.2)] hover:border-[rgba(0,229,255,0.4)] hover:bg-[rgba(0,229,255,0.02)]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading || isLoadingSample}
            aria-label="Upload CSV or Excel file"
          />
          
          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[rgba(0,229,255,0.1)] border border-[rgba(0,229,255,0.2)] flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-[#00E5FF] animate-spin" />
              </div>
              <div>
                <p className="text-sm text-[#F1F5F9] font-medium">Processing your data</p>
                <p className="text-xs text-[#64748B] mt-1">Cleaning, transforming & enriching...</p>
                <p className="text-[10px] text-[#00E5FF] mt-2 capitalize">{cleaningMode} mode active</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[rgba(0,229,255,0.08)] border border-[rgba(0,229,255,0.2)] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Upload className="w-6 h-6 text-[#00E5FF]" />
              </div>
              <div>
                <p className="text-sm text-[#F1F5F9] font-medium">Upload your dataset</p>
                <p className="text-xs text-[#64748B] mt-1">Drop CSV or Excel files here, or click to browse</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[#475569]">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>CSV, XLSX, XLS supported</span>
              </div>
            </div>
          )}
          
        {/* Glow effect on hover */}
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style={{ boxShadow: '0 0 30px rgba(0, 229, 255, 0.15)' }} />
        </div>

        {/* Sample Data Button */}
        <button
          onClick={handleLoadSample}
          disabled={isLoadingSample || isUploading}
          className="relative group overflow-hidden flex flex-col items-center justify-center gap-3 px-8 py-10 rounded-2xl border border-[rgba(168,85,247,0.2)] bg-[rgba(168,85,247,0.03)] hover:bg-[rgba(168,85,247,0.08)] transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed min-w-[200px]"
        >
          {/* Animated Background Glow */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" 
               style={{ background: 'radial-gradient(circle at center, rgba(168,85,247,0.15) 0%, transparent 70%)' }} />
          
          {isLoadingSample ? (
            <div className="flex flex-col items-center gap-3 relative z-10">
              <div className="w-12 h-12 rounded-xl bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.2)] flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-[#A855F7] animate-spin" />
              </div>
              <p className="text-xs text-[#64748B] font-medium animate-pulse">Analyzing sample...</p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.2)] flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 relative z-10 shadow-[0_0_20px_rgba(168,85,247,0.1)]">
                <Database className="w-8 h-8 text-[#A855F7]" />
                <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-[#A855F7] animate-pulse" />
              </div>
              <div className="text-center relative z-10">
                <p className="text-sm text-[#F1F5F9] font-semibold tracking-tight">Try with Sample Data</p>
                <p className="text-[11px] text-[#64748B] mt-1.5 leading-tight">Professional retail sales<br/>analysis environment</p>
              </div>
              
              {/* "Best for Testing" Badge */}
              <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-[#A855F7] text-[9px] font-bold text-white shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                RECIPE
              </div>
            </>
          )}
        </button>
      </div>
    </div>
  );
}