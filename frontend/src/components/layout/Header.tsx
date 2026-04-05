export default function Header() {
  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/70 border-b border-slate-200/60 shadow-sm h-16 flex items-center px-8 transition-all">
      <div className="flex-1 flex items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-widest">Active Workspace</h2>
      </div>
      <div className="flex items-center gap-4">
        {/* Mock Avatar */}
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200 cursor-pointer hover:ring-2 ring-indigo-500/30 transition-all hover:scale-105">
          <span className="text-indigo-700 text-sm font-bold">P</span>
        </div>
      </div>
    </header>
  );
}
