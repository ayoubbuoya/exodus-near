import { useEffect, useState } from 'react';
import {
  Area,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, RefreshCw } from 'lucide-react';
import { useMarket } from '../context/MarketContext';
import { fetchMarketHistory } from '../lib/rpc';
import type { MarketHistoryPoint } from '../types';

export function ApyChart() {
  const { selectedMarket } = useMarket();
  const [data, setData] = useState<MarketHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [range, setRange] = useState<'1H' | '24H' | 'ALL'>('ALL');
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const points = await fetchMarketHistory(
          selectedMarket.marketContractId,
        );
        if (active) {
          setData(points);
          setError(null);
        }
      } catch {
        if (active) {
          setData([]);
          setError('Yield history is temporarily unavailable.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    setData([]);
    void load();
    const interval = setInterval(() => void load(), 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedMarket.marketContractId, retry]);
  const cutoff =
    range === 'ALL' ? 0 : Date.now() - (range === '1H' ? 3600000 : 86400000);
  const points = data
    .filter((point) => Date.parse(point.recorded_at) >= cutoff)
    .map((point) => ({ ...point, timestamp: Date.parse(point.recorded_at) }));
  const timeLabel = (value: number) =>
    new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <section className="chart-panel" aria-label="Indexed yield history">
      <div className="chart-header">
        <div>
          <span className="eyebrow">MARKET HISTORY</span>
          <h2>Yield over time</h2>
        </div>
        <div className="chart-ranges" aria-label="Chart time range">
          {(['1H', '24H', 'ALL'] as const).map((value) => (
            <button
              key={value}
              className={range === value ? 'selected' : ''}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-legend">
        <span>
          <i /> Implied fixed APY
        </span>
        <span>
          <i /> Staking benchmark*
        </span>
      </div>
      <div className="yield-chart">
        {loading && !data.length ? (
          <div className="chart-empty">
            <Activity size={24} className="animate-pulse" />
            <span>Loading indexed market history…</span>
          </div>
        ) : error ? (
          <div className="chart-empty">
            <Activity size={24} />
            <span>{error}</span>
            <button className="text-link" onClick={() => setRetry(retry + 1)}>
              <RefreshCw size={12} />
              Try again
            </button>
          </div>
        ) : !points.length ? (
          <div className="chart-empty">
            <Activity size={24} />
            <span>No snapshots in this time range.</span>
            <span>Indexed history appears here as the keeper records it.</span>
            <button
              className="text-link"
              onClick={() => setRetry((count) => count + 1)}
            >
              <RefreshCw size={12} />
              Refresh history
            </button>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={points}
              margin={{ top: 12, right: 10, left: -24, bottom: 0 }}
            >
              <defs>
                <linearGradient id="yield-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--chart-fixed)"
                    stopOpacity={0.13}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart-fixed)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={timeLabel}
                stroke="var(--chart-axis)"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                minTickGap={60}
              />
              <YAxis
                tickFormatter={(n: number) => `${n}%`}
                stroke="var(--chart-axis)"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                domain={[0, 'auto']}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--panel)',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 10,
                  fontSize: 14,
                  color: 'var(--text)',
                }}
                labelFormatter={(value) =>
                  new Date(Number(value)).toLocaleString()
                }
                formatter={(value, name) => [
                  `${Number(value).toFixed(2)}%`,
                  name,
                ]}
              />
              <Area
                dataKey="implied_apy"
                name="Implied fixed APY"
                type="monotone"
                stroke="var(--chart-fixed)"
                fill="url(#yield-fill)"
                strokeWidth={2}
                dot={points.length === 1}
                isAnimationActive={false}
              />
              <Line
                dataKey="underlying_apy"
                name="Staking benchmark"
                type="monotone"
                stroke="var(--yield)"
                strokeDasharray="4 5"
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="chart-footer">
        <span>*Backend benchmark, not a measured staking return.</span>
        <span
          title={
            data.length
              ? `Last indexed: ${new Date(data[data.length - 1].recorded_at).toLocaleString()}`
              : undefined
          }
        >
          {data.length ? `${data.length} indexed snapshots` : 'Exodus indexer'}
        </span>
      </div>
    </section>
  );
}
