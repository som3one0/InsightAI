"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown, Filter, X, Download, Loader2, Eye, Sparkles, Brain
} from "lucide-react";
import HeaderSparkline from "./HeaderSparkline";

interface FilterState { column: string; value: string; min: string; max: string; }
interface SortState { column: string; order: "asc" | "desc"; }

export default function DataExplorer({ metadata, sessionId }: { metadata: any; sessionId: string }) {
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [filtered, setFiltered] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<SortState>({ column: "", order: "asc" });
  const [filter, setFilter] = useState<FilterState>({ column: "", value: "", min: "", max: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [columnValues, setColumnValues] = useState<string[]>([]);
  const [columnMeta, setColumnMeta] = useState<{ is_numeric: boolean; min: number; max: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingValues, setLoadingValues] = useState(false);
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [activeInsightCol, setActiveInsightCol] = useState<string | null>(null);

  const columnStats = metadata?.column_stats || [];
  const numericCols = columnStats.filter((c: any) => c.type === "Numeric").map((c: any) => c.name);
  const categoricalCols = columnStats.filter((c: any) => c.type === "Categorical").map((c: any) => c.name);

  const statsMap = useMemo(() => {
    const map: Record<string, any> = {};
    columnStats.forEach((s: any) => {
      map[s.name] = s;
    });
    return map;
  }, [columnStats]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page), page_size: String(pageSize), search,
        sort_by: sort.column, sort_order: sort.order,
        filter_col: filter.column, filter_val: filter.value,
        filter_min: filter.min, filter_max: filter.max,
      });
      const res = await fetch(`http://127.0.0.1:8000/api/explore/${sessionId}?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setColumns(data.columns); setRows(data.rows);
      setTotal(data.total); setFiltered(data.filtered); setTotalPages(data.total_pages);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [sessionId, page, pageSize, search, sort, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchColumnValues = useCallback(async (col: string) => {
    if (!col) { setColumnValues([]); setColumnMeta(null); return; }
    setLoadingValues(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/explore/${sessionId}/values?column=${encodeURIComponent(col)}`);
      const data = await res.json();
      setColumnValues(data.values);
      setColumnMeta(data.is_numeric ? { is_numeric: true, min: data.min, max: data.max } : { is_numeric: false, min: 0, max: 0 });
    } catch { setColumnValues([]); setColumnMeta(null); } finally { setLoadingValues(false); }
  }, [sessionId]);

  const handleFilterColumnChange = (col: string) => {
    setFilter({ column: col, value: "", min: "", max: "" });
    setColumnValues([]); setColumnMeta(null); setPage(1);
    if (col) fetchColumnValues(col);
  };

  const handleSort = (col: string) => {
    setPage(1);
    setSort(sort.column === col ? { column: col, order: sort.order === "asc" ? "desc" : "asc" } : { column: col, order: "asc" });
  };

  const clearFilter = () => { setFilter({ column: "", value: "", min: "", max: "" }); setColumnValues([]); setColumnMeta(null); setPage(1); };
  const clearAll = () => { setSearch(""); setSearchInput(""); setSort({ column: "", order: "asc" }); clearFilter(); setPage(1); };

  const SortIcon = ({ col }: { col: string }) => {
    if (sort.column !== col) return <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40" />;
    return sort.order === "asc" ? <ArrowUp className="w-3 h-3 text-[#00E5FF]" /> : <ArrowDown className="w-3 h-3 text-[#00E5FF]" />;
  };

  const isOutlier = (col: string, val: any) => {
    const stats = statsMap[col];
    if (!stats || stats.type !== 'Numeric' || val === null || val === undefined) return false;
    const numVal = Number(val);
    const mean = stats.mean;
    const std = stats.std;
    if (std === 0) return false;
    return Math.abs(numVal - mean) > 2 * std;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#F1F5F9]">Data Explorer</h2>
          <p className="text-xs text-[#64748B] mt-1">
            {filtered < total ? `${filtered.toLocaleString()} of ${total.toLocaleString()} rows` : `${total.toLocaleString()} rows`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowFilters(!showFilters)} 
            className={`filter-chip ${showFilters ? 'active' : ''} flex-1 sm:flex-none justify-center`}
            aria-label={showFilters ? "Hide filters" : "Show filters"}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
            {filter.column && <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] ml-1" />}
          </button>
          <button 
            onClick={() => {
              fetch(`http://127.0.0.1:8000/api/export/${sessionId}`)
                .then(res => res.blob())
                .then(blob => {
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `export_${sessionId}.csv`;
                  a.click();
                  window.URL.revokeObjectURL(url);
                })
                .catch(e => console.error("Export failed:", e));
            }} 
            className="filter-chip flex-1 sm:flex-none justify-center"
            aria-label="Export data to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
        <input 
          type="text" 
          value={searchInput} 
          onChange={(e) => setSearchInput(e.target.value)} 
          placeholder="Search across all columns..." 
          className="input-cyber w-full pl-11 pr-10" 
          aria-label="Search across all columns"
        />
        {searchInput && (
          <button 
            onClick={() => { setSearchInput(""); setSearch(""); }} 
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#94A3B8] cursor-pointer"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="glass-premium p-4 space-y-4 animate-fade-in-up">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2 block">Column</label>
              <select 
                value={filter.column} 
                onChange={(e) => handleFilterColumnChange(e.target.value)} 
                className="input-cyber w-full text-sm"
              >
                <option value="">Select column...</option>
                {categoricalCols.length > 0 && (
                  <optgroup label="Categories" className="text-[#64748B]">
                    {categoricalCols.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
                {numericCols.length > 0 && (
                  <optgroup label="Numeric">
                    {numericCols.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            {filter.column && columnMeta && !columnMeta.is_numeric && (
              <div>
                <label className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2 block">Value</label>
                {loadingValues ? (
                  <div className="text-xs text-[#64748B] py-3">Loading...</div>
                ) : (
                  <select 
                    value={filter.value} 
                    onChange={(e) => { setFilter(f => ({ ...f, value: e.target.value })); setPage(1); }} 
                    className="input-cyber w-full text-sm"
                  >
                    <option value="">All values</option>
                    {columnValues.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </div>
            )}
            {filter.column && columnMeta && columnMeta.is_numeric && (
              <>
                <div>
                  <label className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2 block">Min Value</label>
                  <input 
                    type="number" 
                    value={filter.min} 
                    onChange={(e) => { setFilter(f => ({ ...f, min: e.target.value })); setPage(1); }} 
                    placeholder={`Min: ${columnMeta.min}`} 
                    className="input-cyber w-full text-sm" 
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2 block">Max Value</label>
                  <input 
                    type="number" 
                    value={filter.max} 
                    onChange={(e) => { setFilter(f => ({ ...f, max: e.target.value })); setPage(1); }} 
                    placeholder={`Max: ${columnMeta.max}`} 
                    className="input-cyber w-full text-sm" 
                  />
                </div>
              </>
            )}
          </div>
          {filter.column && (
            <button onClick={clearFilter} className="text-xs text-[#64748B] hover:text-[#00E5FF] transition-colors">
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Active Filters */}
      {(search || filter.column) && (
        <div className="flex items-center gap-2 flex-wrap">
          {search && (
            <span className="filter-chip active">
              <Search className="w-3 h-3" />
              "{search}"
              <button onClick={() => { setSearch(""); setSearchInput(""); }}><X className="w-3 h-3" /></button>
            </span>
          )}
          {filter.column && (
            <span className="filter-chip active">
              <Filter className="w-3 h-3" />
              {filter.column}: {filter.value || `${filter.min || '?'} - ${filter.max || '?'}`}
              <button onClick={clearFilter}><X className="w-3 h-3" /></button>
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="glass-premium overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-[#0A0F1C]/80 backdrop-blur-sm z-20 flex items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-[#64748B]">
              <Loader2 className="w-4 h-4 animate-spin text-[#00E5FF]" />
              Loading data...
            </div>
          </div>
        )}
        <div className="overflow-x-auto overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" role="rowgroup">
              <tr className="border-b border-[rgba(148,163,184,0.1)]" role="row">
                <th className="px-4 py-3 text-left text-[10px] font-medium text-[#64748B] uppercase tracking-wider w-16 bg-[#0F172A]" role="columnheader">#</th>
                {columns.map(col => {
                  const isHovered = hoveredColumn === col;
                  const stats = statsMap[col];
                  const isNumeric = stats?.type === 'Numeric';
                  
                  return (
                    <th 
                      key={col} 
                      onClick={() => handleSort(col)} 
                      onMouseEnter={() => setHoveredColumn(col)}
                      onMouseLeave={() => setHoveredColumn(null)}
                      className={`px-4 py-3 text-left text-[10px] font-medium text-[#64748B] uppercase tracking-wider cursor-pointer select-none group whitespace-nowrap transition-colors bg-[#0F172A] ${isHovered ? 'text-[#00E5FF]' : ''}`}
                      role="columnheader"
                      aria-sort={sort.column === col ? (sort.order === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-1 h-1 rounded-full ${isNumeric ? 'bg-[#00E5FF]' : 'bg-[#C084FC]'} shrink-0`} title={isNumeric ? 'Numeric' : 'Categorical'} />
                        <span className="truncate max-w-[200px]" title={col}>{col}</span>
                        <SortIcon col={col} />
                        {isHovered && (
                          <button 
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[rgba(0,229,255,0.1)]"
                            aria-label={`View AI details for ${col}`}
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setActiveInsightCol(activeInsightCol === col ? null : col);
                            }}
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${activeInsightCol === col ? 'text-[#00E5FF] fill-[#00E5FF]/20' : 'text-[#00E5FF]'}`} />
                          </button>
                        )}
                      </div>

                      {activeInsightCol === col && (
                        <div className="absolute top-10 left-0 w-64 p-4 glass-premium border border-[#00E5FF]/20 z-50 animate-in fade-in zoom-in duration-200">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Brain className="w-3.5 h-3.5 text-[#00E5FF]" />
                              <span className="text-[10px] font-bold text-white uppercase">AI Insights</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setActiveInsightCol(null); }}>
                              <X className="w-3 h-3 text-[#64748B] hover:text-white" />
                            </button>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="p-2 rounded-lg bg-[rgba(148,163,184,0.05)] border border-[rgba(148,163,184,0.1)]">
                              <p className="text-[9px] text-[#64748B] uppercase font-bold mb-1">Quick Stats</p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[8px] text-[#475569]">Unique</p>
                                  <p className="text-[11px] font-mono-data text-[#94A3B8]">{statsMap[col]?.unique_count?.toLocaleString()}</p>
                                </div>
                                <div>
                                  <p className="text-[8px] text-[#475569]">Nulls</p>
                                  <p className="text-[11px] font-mono-data text-[#94A3B8]">{statsMap[col]?.null_count?.toLocaleString()}</p>
                                </div>
                              </div>
                            </div>

                            {statsMap[col]?.type === 'Numeric' && (
                              <div className="p-2 rounded-lg bg-[rgba(0,229,255,0.03)] border border-[rgba(0,229,255,0.1)]">
                                <p className="text-[9px] text-[#00E5FF] uppercase font-bold mb-1">Distribution</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-[#475569]">Avg</span>
                                    <span className="text-[11px] font-mono-data text-[#00E5FF]">{statsMap[col]?.mean?.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-[#475569]">Std Dev</span>
                                    <span className="text-[11px] font-mono-data text-[#00E5FF]">{statsMap[col]?.std?.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="pt-2 border-t border-[rgba(148,163,184,0.1)]">
                              <p className="text-[10px] text-[#94A3B8] leading-relaxed italic">
                                "{statsMap[col]?.type === 'Numeric' 
                                  ? `Detected high variance in ${col}. This column might contain significant outliers.`
                                  : `Showing distribution for ${col}. It has ${statsMap[col]?.unique_count} distinct categories.`}"
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      <HeaderSparkline sessionId={sessionId} columnName={col} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-16 text-center text-[#64748B]">
                    {search || filter.column ? "No results match your filters." : "No data available."}
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIdx) => (
                  <tr 
                    key={rowIdx} 
                    className="border-b border-[rgba(148,163,184,0.05)] hover:bg-[rgba(0,229,255,0.03)] transition-colors"
                  >
                    <td className="px-4 py-3 text-[#475569] text-xs font-mono-data">
                      {(page - 1) * pageSize + rowIdx + 1}
                    </td>
                    {columns.map(col => {
                      const val = row[col];
                      const isNull = val === null || val === undefined;
                      return (
                        <td 
                          key={col} 
                          className={`px-4 py-3 whitespace-nowrap max-w-[300px] truncate transition-colors relative ${isNull ? 'text-[#475569] italic' : 'text-[#94A3B8] hover:text-[#F1F5F9]'} ${isOutlier(col, val) ? 'bg-[rgba(244,63,94,0.03)] text-[#F43F5E]' : ''}`}
                          title={isNull ? 'null' : String(val)}
                        >
                          {isOutlier(col, val) && (
                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#F43F5E]" title="AI-Detected Outlier" />
                          )}
                          {isNull ? 'null' : String(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
        <p className="text-xs text-[#64748B] order-2 sm:order-1">
          Showing <span className="text-[#94A3B8]">{rows.length > 0 ? (page - 1) * pageSize + 1 : 0}</span> - <span className="text-[#94A3B8]">{(page - 1) * pageSize + rows.length}</span> of <span className="text-[#94A3B8]">{filtered.toLocaleString()}</span>
        </p>
        <div className="flex items-center gap-1 order-1 sm:order-2">
          <button 
            onClick={() => setPage(1)} 
            disabled={page <= 1} 
            className="p-2 rounded-lg text-[#64748B] hover:text-[#00E5FF] hover:bg-[rgba(0,229,255,0.1)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))} 
            disabled={page <= 1} 
            className="p-2 rounded-lg text-[#64748B] hover:text-[#00E5FF] hover:bg-[rgba(0,229,255,0.1)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 mx-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) pageNum = i + 1;
              else if (page <= 3) pageNum = i + 1;
              else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = page - 2 + i;
              return (
                <button 
                  key={pageNum} 
                  onClick={() => setPage(pageNum)} 
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${page === pageNum ? 'bg-[#00E5FF] text-[#0A0F1C]' : 'text-[#64748B] hover:text-[#00E5FF] hover:bg-[rgba(0,229,255,0.1)]'}`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
            disabled={page >= totalPages} 
            className="p-2 rounded-lg text-[#64748B] hover:text-[#00E5FF] hover:bg-[rgba(0,229,255,0.1)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setPage(totalPages)} 
            disabled={page >= totalPages} 
            className="p-2 rounded-lg text-[#64748B] hover:text-[#00E5FF] hover:bg-[rgba(0,229,255,0.1)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}