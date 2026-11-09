import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useMarket } from '../context/MarketContext';
import { fetchMarketHistory } from '../lib/rpc';
import type { MarketHistoryPoint } from '../types';
import { Activity } from 'lucide-react';

export const ApyChart: React.FC = () => {
  const { selectedMarket } = useMarket();
  const [data, setData] = useState<MarketHistoryPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchMarketHistory(selectedMarket.id)
      .then((points) => {
        if (mounted) {
          // Format timestamps for display
          const formatted = points.map((p) => {
            const date = new Date(p.recorded_at);
            return {
              ...p,
              timeLabel: `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`,
            };
          });
          setData(formatted);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedMarket]);

  return (
    <div className="glass-panel rounded-2xl p-5 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-2">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100">
            Yield History: Implied APY vs Underlying APY
          </h3>
        </div>
        <div className="flex items-center space-x-4 text-xs font-semibold">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <span className="text-slate-300">PT Implied APY (Fixed)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-slate-300">Underlying APY (Variable)</span>
          </div>
        </div>
      </div>

      <div className="h-64 w-full mt-4">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
            Loading chart history...
          </div>
        ) : data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
            No history recorded yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                domain={['dataMin - 1', 'dataMax + 1']}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0b1329',
                  borderColor: '#1e293b',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                  color: '#f1f5f9',
                }}
                formatter={(value: any) => [`${Number(value).toFixed(2)}%`, '']}
              />
              <Line
                type="monotone"
                dataKey="implied_apy"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={false}
                name="Implied Fixed APY"
              />
              <Line
                type="monotone"
                dataKey="underlying_apy"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                name="Underlying APY"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
