import { LineChart, LayoutDashboard, Settings, Compass } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col transition-all duration-300 z-50">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <LineChart className="w-6 h-6 text-indigo-400 mr-3" />
        <span className="font-bold text-lg text-white tracking-tight">InsightAI</span>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-2">
        <a href="#" className="flex items-center px-3 py-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-slate-800 transition-colors">
          <LayoutDashboard className="w-5 h-5 mr-3" />
          <span className="font-medium text-sm">Dashboard</span>
        </a>
        <a href="#" className="flex items-center px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors group">
          <Compass className="w-5 h-5 mr-3 group-hover:text-amber-400 transition-colors" />
          <span className="font-medium text-sm">Explore Models</span>
        </a>
      </nav>

      <div className="p-4 border-t border-slate-800">
        <a href="#" className="flex items-center px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors group">
          <Settings className="w-5 h-5 mr-3 group-hover:rotate-45 transition-transform duration-300" />
          <span className="font-medium text-sm">Settings</span>
        </a>
      </div>
    </aside>
  );
}
