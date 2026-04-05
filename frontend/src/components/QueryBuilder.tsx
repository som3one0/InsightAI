"use client";
import { useState } from "react";
import { Play, X, Settings } from "lucide-react";

interface QueryBuilderProps {
  metadata: any;
  sessionId: string;
  onExecuteQuery: (query: string) => void;
}

export default function QueryBuilder({ metadata, onExecuteQuery }: QueryBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState("");
  const [selectedOperation, setSelectedOperation] = useState("");
  const [selectedGroupBy, setSelectedGroupBy] = useState("");
  const [limit, setLimit] = useState(10);

  const numericCols = metadata?.numeric_cols || [];
  const categoricalCols = metadata?.categorical_cols || [];

  const operations = [
    { value: "average", label: "Average" },
    { value: "sum", label: "Sum" },
    { value: "top", label: "Top" },
  ];

  const generateQuery = () => {
    if (!selectedColumn || !selectedOperation) return;
    let query = "";
    if (selectedOperation === "top" && selectedGroupBy) query = `Show me the top ${limit} ${selectedColumn} per ${selectedGroupBy}`;
    else if (selectedOperation === "average" && selectedGroupBy) query = `What is the average ${selectedColumn} per ${selectedGroupBy}?`;
    else if (selectedOperation === "sum" && selectedGroupBy) query = `What is the total ${selectedColumn} per ${selectedGroupBy}?`;
    else if (selectedOperation === "average") query = `What is the average ${selectedColumn}?`;
    else if (selectedOperation === "sum") query = `What is the total ${selectedColumn}?`;
    else if (selectedOperation === "top") query = `Show me the top ${limit} ${selectedColumn}`;

    if (query) {
      onExecuteQuery(query);
      setSelectedColumn(""); setSelectedOperation(""); setSelectedGroupBy(""); setLimit(10);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#737373] hover:text-[#d4d4d4] hover:bg-[#1a1a1a]/60 cursor-pointer"
      >
        <Settings className="w-3.5 h-3.5" />
        Builder
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 w-80 glass rounded-lg p-4 shadow-soft-md z-50 animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#737373]">Query Builder</span>
            <button onClick={() => setIsOpen(false)} className="text-[#404040] hover:text-[#a3a3a3] cursor-pointer"><X className="w-4 h-4" /></button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-[#525252] uppercase tracking-wider mb-1 block">Column</label>
              <select value={selectedColumn} onChange={(e) => { setSelectedColumn(e.target.value); setSelectedOperation(""); setSelectedGroupBy(""); }} className="w-full bg-[#0f0f0f] border border-[#262626] rounded-lg px-3 py-2 text-sm text-[#e5e5e5] outline-none">
                <option value="">Select column...</option>
                {numericCols.map((col: string) => <option key={col} value={col}>{col}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-[#525252] uppercase tracking-wider mb-1 block">Operation</label>
              <div className="grid grid-cols-3 gap-2">
                {operations.map(op => (
                  <button key={op.value} onClick={() => setSelectedOperation(op.value)} disabled={!selectedColumn} className={`py-2 rounded-lg border text-xs font-medium transition-colors ${selectedOperation === op.value ? 'bg-[#1f1f1f] border-[#404040] text-[#e5e5e5]' : 'border-[#262626] text-[#525252] hover:text-[#a3a3a3] hover:border-[#333]'} disabled:opacity-30`}>
                    {op.label}
                  </button>
                ))}
              </div>
            </div>

            {(selectedOperation === "average" || selectedOperation === "sum" || selectedOperation === "top") && (
              <div>
                <label className="text-[10px] text-[#525252] uppercase tracking-wider mb-1 block">Group by</label>
                <select value={selectedGroupBy} onChange={(e) => setSelectedGroupBy(e.target.value)} className="w-full bg-[#0f0f0f] border border-[#262626] rounded-lg px-3 py-2 text-sm text-[#e5e5e5] outline-none">
                  <option value="">No grouping</option>
                  {categoricalCols.map((col: string) => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
            )}

            {selectedOperation === "top" && (
              <div>
                <label className="text-[10px] text-[#525252] uppercase tracking-wider mb-1 block">Limit</label>
                <input type="number" value={limit} onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 1))} min="1" max="100" className="w-full bg-[#0f0f0f] border border-[#262626] rounded-lg px-3 py-2 text-sm text-[#e5e5e5] outline-none" />
              </div>
            )}

            {selectedColumn && selectedOperation && (
              <div className="bg-[#0f0f0f] border border-[#262626] rounded-lg px-3 py-2 text-xs text-[#a3a3a3] italic">
                {selectedOperation === "top" && selectedGroupBy ? `Top ${limit} ${selectedColumn} per ${selectedGroupBy}` :
                 selectedOperation === "average" && selectedGroupBy ? `Average ${selectedColumn} per ${selectedGroupBy}` :
                 selectedOperation === "sum" && selectedGroupBy ? `Total ${selectedColumn} per ${selectedGroupBy}` :
                 selectedOperation === "average" ? `Average ${selectedColumn}` :
                 selectedOperation === "sum" ? `Total ${selectedColumn}` :
                 `Top ${limit} ${selectedColumn}`}
              </div>
            )}

            <button onClick={generateQuery} disabled={!selectedColumn || !selectedOperation} className="w-full flex items-center justify-center gap-2 bg-[#262626] hover:bg-[#333] disabled:opacity-30 text-[#e5e5e5] px-4 py-3 min-h-[44px] rounded-lg text-xs font-medium transition-colors">
              <Play className="w-3.5 h-3.5" />
              Run query
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
