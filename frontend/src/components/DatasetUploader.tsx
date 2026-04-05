"use client";
import React, { useCallback, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface DatasetUploaderProps {
  onUploadSuccess: (sessionId: string, metadata: any, insights: string) => void;
  onError: (error: string) => void;
}

export default function DatasetUploader({ onUploadSuccess, onError }: DatasetUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      onError("Please upload a CSV or Excel file.");
      return;
    }
    
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('http://127.0.0.1:8000/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Upload failed');
      
      onUploadSuccess(data.session_id, data.metadata, data.insights);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      onError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto my-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`relative overflow-hidden border border-slate-200/80 rounded-3xl p-16 text-center transition-all duration-300 backdrop-blur-xl ${
          isDragging ? 'border-indigo-400 bg-indigo-50/40 scale-[1.02] shadow-lg shadow-indigo-100/50' : 'bg-white/60 hover:border-slate-300 hover:bg-white/90'
        } ${isLoading ? 'opacity-70 pointer-events-none grayscale-[0.2]' : ''} shadow-sm hover:shadow-md cursor-pointer group`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        
        <div className="flex justify-center mb-6 relative z-10">
          <div className="p-4 bg-white rounded-full shadow-sm ring-1 ring-slate-900/5 group-hover:scale-110 transition-transform duration-300">
            {isLoading ? (
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
            ) : (
              <UploadCloud className="w-10 h-10 text-indigo-500 drop-shadow-sm" />
            )}
          </div>
        </div>
        
        <h3 className="text-2xl font-bold mb-3 text-slate-800 tracking-tight relative z-10">
          {isLoading ? 'Analyzing dataset...' : 'Upload your dataset'}
        </h3>
        
        <p className="text-slate-500 mb-8 max-w-sm mx-auto text-base leading-relaxed relative z-10">
          Drag and drop your CSV or Excel file here, or browse from your computer to generate instant insights.
        </p>
        
        <label className="cursor-pointer bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white px-8 py-3.5 rounded-full font-medium transition-all inline-flex items-center shadow-md hover:shadow-lg hover:-translate-y-0.5 relative z-10 ring-1 ring-white/20">
          Select File
          <input 
            type="file" 
            className="hidden" 
            accept=".csv,.xlsx,.xls" 
            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
          />
        </label>
      </div>
    </div>
  );
}
