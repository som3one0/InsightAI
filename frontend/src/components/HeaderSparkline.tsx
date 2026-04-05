"use client";

import { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, ResponsiveContainer, YAxis } from 'recharts';

interface HeaderSparklineProps {
  sessionId: string;
  columnName: string;
}

export default function HeaderSparkline({ sessionId, columnName }: HeaderSparklineProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`http://127.0.0.1:8000/api/column-distribution/${sessionId}/${columnName}`);
        if (res.data.distribution && res.data.distribution.length > 0) {
          setData(res.data.distribution);
        } else {
          setData([]);
        }
      } catch (err) {
        console.error("Sparkline fetch failed", err);
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sessionId, columnName]);

  if (loading || data.length === 0) return <div className="h-[20px] w-full" />;

  return (
    <div className="h-[20px] w-full opacity-40 hover:opacity-100 transition-opacity mt-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <Bar dataKey="count" fill="currentColor" radius={[1, 1, 0, 0]} />
          <YAxis hide />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
