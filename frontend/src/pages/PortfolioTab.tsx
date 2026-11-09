import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { useMarket } from '../context/MarketContext';
import { formatUnits, formatIndex, shortenAddress } from '../lib/formatters';
import { APP_CONFIG } from '../config';
import type { ActiveTab, TxStatus } from '../types';
import {
  Wallet,
  Sparkles,
  Coins,
  Droplets,
  ArrowRight,
  ExternalLink,
  Flame,
} from 'lucide-react';

interface PortfolioTabProps {
  onTxUpdate: (tx: TxStatus) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

export const PortfolioTab: React.FC<PortfolioTabProps> = ({ onTxUpdate, onNavigateTab }) => {
  const { accountId, isConnected, connect, executeTransaction } = useWallet();
  const { selectedMarket, marketData, userPosition, lstBalance, refresh } = useMarket();

  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [isBumping, setIsBumping] = useState<boolean>(false);

  const ptBalanceFormatted = formatUnits(userPosition?.pt_balance, 4);
  const ytBalanceFormatted = formatUnits(userPosition?.yt_balance, 4);
  const lpBalanceFormatted = formatUnits(userPosition?.lp_balance, 4);
  const accruedSyFormatted = formatUnits(userPosition?.accrued_sy, 4);
  const lstBalanceFormatted = formatUnits(lstBalance, 4);
  const pyIndexFormatted = formatIndex(marketData?.py_index);

  // Claim accrued staking yield from YT
  const handleClaimYield = async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    try {
      setIsClaiming(true);
      onTxUpdate({
        status: 'pending',
        title: 'Claiming Staking Yield',
        message: 'Broadcasting claim_interest transaction to NEAR...',
      });

      const tx = await executeTransaction(
        selectedMarket.marketContractId,
        'claim_interest',
        {},
        '1', // 1 yocto deposit required by NEAR standards
        APP_CONFIG.gasUnits.standard
      );

      onTxUpdate({
        status: 'success',
        title: 'Yield Claimed!',
        message: `Successfully claimed ${accruedSyFormatted} ${selectedMarket.symbol} in staking yield.`,
        txHash: tx?.transaction?.hash,
      });

      await refresh();
    } catch (err: any) {
      console.error('Claim error:', err);
      onTxUpdate({
        status: 'error',
        title: 'Claim Failed',
        message: err?.message || 'Could not claim yield.',
      });
    } finally {
      setIsClaiming(false);
    }
  };

  // Demo yield simulator (Bumps MockLST rate and refreshes market index)
  const handleSimulateYieldBump = async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    try {
      setIsBumping(true);
      onTxUpdate({
        status: 'pending',
        title: 'Simulating Staking Yield Boost',
        message: 'Bumping MockLST testnet exchange rate by +1.6% and refreshing index...',
      });

      // 1. Advance rate on MockLST contract (1000 bps = +1.0%, 1600 = +1.6%)
      await executeTransaction(
        selectedMarket.lstContractId,
        'advance_rate',
        { delta_bps: 1600 },
        '0',
        APP_CONFIG.gasUnits.standard
      );

      // 2. Refresh market contract index
      const tx = await executeTransaction(
        selectedMarket.marketContractId,
        'refresh_index',
        {},
        '0',
        APP_CONFIG.gasUnits.standard
      );

      onTxUpdate({
        status: 'success',
        title: 'Yield Boost Simulated!',
        message: 'MockLST rate bumped! Check your YT claimable interest now.',
        txHash: tx?.transaction?.hash,
      });

      await refresh();
    } catch (err: any) {
      console.error('Demo advance error:', err);
      onTxUpdate({
        status: 'error',
        title: 'Simulation Failed',
        message: err?.message || 'Failed to bump rate on testnet.',
      });
    } finally {
      setIsBumping(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 text-cyan-400 mx-auto flex items-center justify-center mb-6">
          <Wallet className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Connect Your NEAR Wallet</h2>
        <p className="text-sm text-slate-400 mb-6">
          View your Principal Tokens (PT), Yield Tokens (YT), Liquidity shares, and claim accrued staking yield.
        </p>
        <button
          onClick={connect}
          className="w-full py-3.5 rounded-xl font-bold text-base bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 shadow-lg shadow-cyan-500/20 transition active:scale-95"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Account Overview Header */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 mb-1">
            <span>Connected Account</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-mono text-white flex items-center space-x-2">
            <span>{accountId}</span>
            <a
              href={`${APP_CONFIG.explorerUrl}/address/${accountId}`}
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-cyan-400"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Active Market: <strong className="text-slate-200">{selectedMarket.name}</strong>
          </p>
        </div>

        {/* Claim Yield Widget */}
        <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 sm:p-5 flex items-center space-x-4">
          <div>
            <span className="text-xs font-semibold text-slate-400 block">Claimable Staking Yield</span>
            <span className="text-2xl font-mono font-extrabold text-emerald-400">
              {accruedSyFormatted} {selectedMarket.symbol}
            </span>
          </div>
          <button
            onClick={handleClaimYield}
            disabled={isClaiming || parseFloat(accruedSyFormatted) <= 0}
            className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-md shadow-emerald-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isClaiming ? 'Claiming...' : 'Claim Yield'}
          </button>
        </div>
      </div>

      {/* Demo Staking Yield Simulation Card for Hackathon Judges */}
      {selectedMarket.isDemo && (
        <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-600/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 mt-0.5">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-200">Hackathon Demo Staking Yield Simulator</h4>
              <p className="text-xs text-amber-300/80 mt-0.5 leading-relaxed">
                Click the button to simulate on-chain staking yield by advancing the MockLST rate by +1.6% and refreshing the market index. Then watch your claimable yield increase above!
              </p>
            </div>
          </div>
          <button
            onClick={handleSimulateYieldBump}
            disabled={isBumping}
            className="shrink-0 px-4 py-2 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 transition active:scale-95 disabled:opacity-50"
          >
            {isBumping ? 'Advancing...' : '⚡ Simulate Yield Boost (+1.6%)'}
          </button>
        </div>
      )}

      {/* Grid of User Positions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Principal Tokens (PT) */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100">Principal Tokens (PT)</h3>
                <span className="text-xs text-slate-400">Fixed Maturity Asset</span>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('fix')}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
            >
              <span>Trade</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs text-slate-400">Holding</span>
              <span className="text-xl font-mono font-bold text-cyan-400">{ptBalanceFormatted} PT</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Value at Maturity</span>
              <span className="font-mono text-slate-200">
                {ptBalanceFormatted} NEAR worth of {selectedMarket.symbol}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Yield Tokens (YT) */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100">Yield Tokens (YT)</h3>
                <span className="text-xs text-slate-400">Variable Yield Stream</span>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('long')}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
            >
              <span>Trade YT</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs text-slate-400">Holding</span>
              <span className="text-xl font-mono font-bold text-emerald-400">{ytBalanceFormatted} YT</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Current Rate (py_index)</span>
              <span className="font-mono text-slate-200">{pyIndexFormatted} NEAR</span>
            </div>
          </div>
        </div>

        {/* Card 3: LP Position */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                <Droplets className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100">Liquidity Provider (LP)</h3>
                <span className="text-xs text-slate-400">Logit AMM Shares</span>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('pool')}
              className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center space-x-1"
            >
              <span>Pool</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs text-slate-400">Holding</span>
              <span className="text-xl font-mono font-bold text-purple-400">{lpBalanceFormatted} LP</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Swap Fees Earning</span>
              <span className="text-emerald-400 font-semibold">Active</span>
            </div>
          </div>
        </div>

        {/* Card 4: Wallet LST Balance */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100">Wallet {selectedMarket.symbol}</h3>
                <span className="text-xs text-slate-400">Underlying Staked NEAR</span>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('fix')}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
            >
              <span>Deposit</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs text-slate-400">Available Balance</span>
              <span className="text-xl font-mono font-bold text-slate-100">
                {lstBalanceFormatted} {selectedMarket.symbol}
              </span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Token Contract</span>
              <span className="font-mono text-slate-400">{shortenAddress(selectedMarket.lstContractId, 6)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
