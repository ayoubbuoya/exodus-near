import React from 'react';
import { useMarket } from '../context/MarketContext';
import { calcImpliedApyPercent, formatIndex, formatPercent, formatUnits, getDaysRemaining } from '../lib/formatters';
import { TrendingUp, Percent, Calendar, ShieldCheck, Flame, ExternalLink } from 'lucide-react';
import { APP_CONFIG } from '../config';

export const MarketStats: React.FC = () => {
  const { selectedMarket, marketData, poolData, isLoading } = useMarket();

  const impliedApy = calcImpliedApyPercent(poolData?.last_ln_implied_rate);
  const underlyingApy = 7.15; // Benchmark standard LST staking yield on NEAR
  const daysLeft = getDaysRemaining(selectedMarket.expiryNs);
  const pyIndexFormatted = formatIndex(marketData?.py_index);
  const totalSyFormatted = formatUnits(marketData?.total_sy, 2);
  const totalPtFormatted = formatUnits(marketData?.total_pt, 2);

  return (
    <div className="space-y-4 mb-8">
      {/* Demo notification banner */}
      {selectedMarket.isDemo && (
        <div className="bg-amber-950/40 border border-amber-600/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-amber-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-amber-100">
                Hackathon Demo Market active ({selectedMarket.asset})
              </p>
              <p className="text-xs text-amber-300/80">
                Simulated rate source allows proving full lifecycle (yield bump, interest claim, and maturity).
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <a
              href={`${APP_CONFIG.explorerUrl}/address/${selectedMarket.marketContractId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-900/60 hover:bg-amber-900 border border-amber-700/50 text-xs font-semibold text-amber-100 transition"
            >
              <span>Market Contract</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* Grid of Key Market Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Implied Fixed APY */}
        <div className="glass-panel glass-panel-hover rounded-2xl p-4 sm:p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center">
              <TrendingUp className="w-3.5 h-3.5 mr-1 text-cyan-400" />
              Fixed APY
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold">
              Guaranteed
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-cyan-400 tracking-tight font-mono">
            {isLoading && !marketData ? '--' : formatPercent(impliedApy)}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Lock yield if held to maturity
          </p>
        </div>

        {/* Metric 2: Underlying APY */}
        <div className="glass-panel glass-panel-hover rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center">
              <Percent className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              Underlying APY
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-semibold">
              Variable
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight font-mono">
            ~{formatPercent(underlyingApy)}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Index: <span className="font-mono text-slate-200">{pyIndexFormatted}</span> NEAR
          </p>
        </div>

        {/* Metric 3: Maturity & Days Left */}
        <div className="glass-panel glass-panel-hover rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1 text-purple-400" />
              Maturity
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/60 font-semibold font-mono">
              {daysLeft}d left
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-100 tracking-tight">
            {selectedMarket.maturityFormatted}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            PT redeems for 1 NEAR of LST
          </p>
        </div>

        {/* Metric 4: AMM Liquidity / TVL */}
        <div className="glass-panel glass-panel-hover rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-blue-400" />
              Pool Reserves
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/60 font-semibold">
              AMM
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight font-mono">
            {isLoading && !marketData ? '--' : `${totalSyFormatted} ${selectedMarket.symbol}`}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            + {totalPtFormatted} PT in pool
          </p>
        </div>
      </div>
    </div>
  );
};
