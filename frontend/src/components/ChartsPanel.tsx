import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { BarChart3 } from 'lucide-react';

const placeholderData = [
  { name: 'Jan', value: 400 },
  { name: 'Feb', value: 300 },
  { name: 'Mar', value: 600 },
  { name: 'Apr', value: 800 },
  { name: 'May', value: 500 }
];

export default function ChartsPanel() {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col h-[300px]">
      <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-indigo-400" />
        Data Distribution
      </h2>
      <div className="flex-1 w-full text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={placeholderData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis dataKey="name" stroke="#888" tickLine={false} axisLine={false} />
            <YAxis stroke="#888" tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#171717', border: '1px solid #333', borderRadius: '8px' }}
              itemStyle={{ color: '#818cf8' }}
            />
            <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
