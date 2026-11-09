import React, { useState, useEffect, useMemo } from 'react';
import { useWallet } from '../context/WalletContext';
import { useMarket } from '../context/MarketContext';
import { formatUnits, parseUnits, formatPercent, calcImpliedApyPercent } from '../lib/formatters';
import { fetchPreviewSyForYt, fetchPreviewYtForSy } from '../lib/rpc';
import { APP_CONFIG } from '../config';
import type { TxStatus } from '../types';
import { ArrowDownUp, Zap, AlertCircle, TrendingUp, Sparkles, Scale } from 'lucide-react';

interface LongYieldTabProps {
  onTxUpdate: (tx: TxStatus) => void;
}

export const LongYieldTab: React.FC<LongYieldTabProps> = ({ onTxUpdate }) => {
  const { isConnected, connect, executeTransaction } = useWallet();
  const { selectedMarket, poolData, userPosition, lstBalance, refresh } = useMarket();

  const [mode, setMode] = useState<'buy' | 'sell'>('buy'); // Buy YT with LST or Sell YT for LST
  const [amountInput, setAmountInput] = useState<string>('5');
  const [slippageBps, setSlippageBps] = useState<number>(50); // 0.5%
  const [previewOut, setPreviewOut] = useState<string>('0');
  const [feeSy, setFeeSy] = useState<string>('0');
  const [isQuoting, setIsQuoting] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const impliedApy = calcImpliedApyPercent(poolData?.last_ln_implied_rate);

  // Debounced quote preview
  useEffect(() => {
    let active = true;
    const amountFloat = parseFloat(amountInput);

    if (isNaN(amountFloat) || amountFloat <= 0) {
      setPreviewOut('0');
      setFeeSy('0');
      setQuoteError(null);
      return;
    }

    setIsQuoting(true);
    setQuoteError(null);

    const timer = setTimeout(async () => {
      try {
        const yoctoIn = parseUnits(amountInput);
        if (mode === 'buy') {
          const res = await fetchPreviewSyForYt(selectedMarket.marketContractId, yoctoIn);
          if (active) {
            setPreviewOut(res.amount_out);
            setFeeSy(res.fee_sy);
          }
        } else {
          const res = await fetchPreviewYtForSy(selectedMarket.marketContractId, yoctoIn);
          if (active) {
            setPreviewOut(res.amount_out);
            setFeeSy(res.fee_sy);
          }
        }
      } catch (err: any) {
        if (active) {
          console.warn('YT Quote error:', err);
          setQuoteError('Pool liquidity constraint reached or market expired.');
          setPreviewOut('0');
        }
      } finally {
        if (active) setIsQuoting(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [amountInput, mode, selectedMarket]);

  // Minimum received accounting for slippage tolerance
  const minOut = useMemo(() => {
    try {
      if (!previewOut || previewOut === '0') return '0';
      const big = BigInt(previewOut);
      const factor = BigInt(10000 - slippageBps);
      return ((big * factor) / 10000n).toString();
    } catch {
      return '0';
    }
  }, [previewOut, slippageBps]);

  // Compute effective leverage: Leverage = YT_out / sy_in
  const effectiveLeverage = useMemo(() => {
    if (mode !== 'buy') return null;
    const input = parseFloat(amountInput);
    const out = parseFloat(formatUnits(previewOut, 4));
    if (isNaN(input) || input <= 0 || isNaN(out) || out <= 0) return null;
    const lev = out / input;
    return `${lev.toFixed(1)}x`;
  }, [mode, amountInput, previewOut]);

  const handleMax = () => {
    if (mode === 'buy') {
      setAmountInput(formatUnits(lstBalance, 4));
    } else {
      setAmountInput(formatUnits(userPosition?.yt_balance, 4));
    }
  };

  const handleTrade = async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    try {
      const yoctoIn = parseUnits(amountInput);

      onTxUpdate({
        status: 'pending',
        title: mode === 'buy' ? 'Entering Long Yield Position' : 'Exiting Long Yield Position',
        message: 'Broadcasting transaction to NEAR Testnet...',
      });

      if (mode === 'buy') {
        // Swap LST for YT via ft_transfer_call
        const msg = JSON.stringify({
          action: 'swap_exact_sy_for_yt',
          min_yt_out: minOut,
        });

        const tx = await executeTransaction(
          selectedMarket.lstContractId,
          'ft_transfer_call',
          {
            receiver_id: selectedMarket.marketContractId,
            amount: yoctoIn,
            msg,
          },
          '1',
          APP_CONFIG.gasUnits.swap
        );

        onTxUpdate({
          status: 'success',
          title: 'Long Yield Activated!',
          message: `Successfully purchased ${formatUnits(previewOut, 2)} YT with ${amountInput} ${selectedMarket.symbol}.`,
          txHash: tx?.transaction?.hash,
        });
      } else {
        // Swap YT for LST directly on market contract
        const tx = await executeTransaction(
          selectedMarket.marketContractId,
          'swap_exact_yt_for_sy',
          {
            yt_in: yoctoIn,
            min_sy_out: minOut,
          },
          '1',
          APP_CONFIG.gasUnits.swap
        );

        onTxUpdate({
          status: 'success',
          title: 'YT Sold for LST',
          message: `Successfully sold ${amountInput} YT for ${formatUnits(previewOut, 2)} ${selectedMarket.symbol}.`,
          txHash: tx?.transaction?.hash,
        });
      }

      await refresh();
    } catch (err: any) {
      console.error('YT Trade error:', err);
      onTxUpdate({
        status: 'error',
        title: 'Transaction Failed',
        message: err?.message || 'Transaction could not be completed.',
      });
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-800">
        {/* Tab Toggle: Buy YT vs Sell YT */}
        <div className="flex p-1 bg-slate-900/90 rounded-2xl mb-6 border border-slate-800">
          <button
            onClick={() => setMode('buy')}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center space-x-1.5 ${
              mode === 'buy'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Long Yield (Buy YT)</span>
          </button>
          <button
            onClick={() => setMode('sell')}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
              mode === 'sell'
                ? 'bg-slate-800 text-slate-100 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Exit Long (Sell YT)
          </button>
        </div>

        {/* Leverage & Break-Even Metric Badges */}
        {mode === 'buy' && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-800/40">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center">
                <TrendingUp className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Yield Leverage
              </span>
              <span className="text-xl font-extrabold font-mono text-emerald-400 block mt-0.5">
                {effectiveLeverage || '~12.5x'}
              </span>
              <span className="text-[10px] text-slate-400">Zero liquidation risk</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-800/40">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center">
                <Scale className="w-3.5 h-3.5 mr-1 text-cyan-400" />
                Break-Even APY
              </span>
              <span className="text-xl font-extrabold font-mono text-cyan-400 block mt-0.5">
                {formatPercent(impliedApy)}
              </span>
              <span className="text-[10px] text-slate-400">Profit if staking &gt; {formatPercent(impliedApy)}</span>
            </div>
          </div>
        )}

        {/* Input Card */}
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800 mb-4">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-2">
            <span>You Pay</span>
            <span className="flex items-center space-x-1">
              <span>Balance:</span>
              <span className="text-slate-200 font-mono">
                {mode === 'buy' ? formatUnits(lstBalance, 4) : formatUnits(userPosition?.yt_balance, 4)}
              </span>
              <button
                onClick={handleMax}
                className="text-emerald-400 hover:text-emerald-300 ml-1 font-bold underline"
              >
                MAX
              </button>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.0"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="bg-transparent text-2xl sm:text-3xl font-mono font-bold text-white focus:outline-none w-2/3"
            />
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="font-bold text-sm text-slate-200">
                {mode === 'buy' ? selectedMarket.symbol : 'YT'}
              </span>
            </div>
          </div>
        </div>

        {/* Direction Indicator */}
        <div className="flex justify-center -my-2 relative z-10">
          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 shadow-lg">
            <ArrowDownUp className="w-4 h-4" />
          </div>
        </div>

        {/* Output Card */}
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800 mt-2 mb-6">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-2">
            <span>You Receive</span>
            <span className="text-emerald-400 text-[11px] font-semibold flex items-center">
              <Sparkles className="w-3 h-3 mr-1" />
              {mode === 'buy' ? 'Full Yield Rights' : 'Reclaimed LST'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-2xl sm:text-3xl font-mono font-bold text-emerald-400">
              {isQuoting ? (
                <span className="text-slate-500 animate-pulse">Calculating...</span>
              ) : (
                formatUnits(previewOut, 4)
              )}
            </div>
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="font-bold text-sm text-slate-200">
                {mode === 'buy' ? 'YT' : selectedMarket.symbol}
              </span>
            </div>
          </div>
        </div>

        {/* Error Notification */}
        {quoteError && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-300 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{quoteError}</span>
          </div>
        )}

        {/* Educational Explainer */}
        {mode === 'buy' && parseFloat(amountInput) > 0 && !quoteError && (
          <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-800/30 text-xs text-emerald-200 mb-6 space-y-2">
            <div className="flex items-center space-x-2 font-bold text-emerald-300">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>How Long Yield Works</span>
            </div>
            <p className="leading-relaxed">
              You pay <strong className="text-white font-mono">{amountInput} {selectedMarket.symbol}</strong> to receive{' '}
              <strong className="text-white font-mono">{formatUnits(previewOut, 2)} YT</strong>. You collect 100% of all staking yield on{' '}
              <strong className="text-white font-mono">{formatUnits(previewOut, 2)} NEAR</strong> until{' '}
              <strong className="text-white">{selectedMarket.maturityFormatted}</strong> without borrowing or liquidation risk!
            </p>
          </div>
        )}

        {/* Details Accordion */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs space-y-2 mb-6">
          <div className="flex justify-between text-slate-400">
            <span>Slippage Tolerance</span>
            <div className="flex space-x-1.5">
              {[10, 50, 100].map((bps) => (
                <button
                  key={bps}
                  onClick={() => setSlippageBps(bps)}
                  className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                    slippageBps === bps
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {(bps / 100).toFixed(1)}%
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Minimum Received</span>
            <span className="font-mono text-slate-200">{formatUnits(minOut, 4)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Protocol Fee</span>
            <span className="font-mono text-slate-200">{formatUnits(feeSy, 4)} {selectedMarket.symbol}</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleTrade}
          disabled={isQuoting || !!quoteError || parseFloat(amountInput) <= 0}
          className="w-full py-4 rounded-2xl font-extrabold text-base transition-all bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-xl shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {!isConnected
            ? 'Connect Wallet to Trade'
            : mode === 'buy'
            ? `Activate Long Yield (${effectiveLeverage || 'Leveraged'})`
            : 'Exit Position (Sell YT)'}
        </button>
      </div>
    </div>
  );
};
