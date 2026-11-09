import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { useMarket } from '../context/MarketContext';
import { APP_CONFIG } from '../config';
import { shortenAddress } from '../lib/formatters';
import type { TxStatus } from '../types';
import { Wallet, LogOut, ChevronDown, Sparkles, ExternalLink } from 'lucide-react';

interface NavbarProps {
  onTxUpdate?: (tx: TxStatus) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onTxUpdate }) => {
  const { accountId, isConnected, isConnecting, connect, disconnect, executeTransaction } = useWallet();
  const { selectedMarket, setSelectedMarket, refresh } = useMarket();
  const [isClaimingFaucet, setIsClaimingFaucet] = useState<boolean>(false);

  const handleClaimFaucet = async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    setIsClaimingFaucet(true);
    onTxUpdate?.({
      status: 'pending',
      title: 'Claiming Demo LST',
      message: 'Requesting 100 MockLST from the testnet faucet...',
    });

    try {
      const tx = await executeTransaction(
        selectedMarket.lstContractId,
        'faucet_claim',
        {},
        '0',
        APP_CONFIG.gasUnits.standard
      );

      onTxUpdate?.({
        status: 'success',
        title: '100 Demo LST Received!',
        message: 'Successfully claimed 100 MockLST. You are ready to trade PT, YT, or provide liquidity!',
        txHash: tx?.transaction?.hash,
      });

      await refresh();
    } catch (err: any) {
      console.error('Faucet claim error:', err);
      onTxUpdate?.({
        status: 'error',
        title: 'Faucet Claim Failed',
        message: err?.message || 'Could not claim testnet MockLST. Please ensure your wallet has a small amount of testnet NEAR for gas.',
      });
    } finally {
      setIsClaimingFaucet(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 p-0.5 shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <span className="text-xl font-black bg-gradient-to-r from-cyan-400 to-emerald-300 bg-clip-text text-transparent">
                EX
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold tracking-tight text-white">EXODUS</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                NEAR
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium -mt-0.5 hidden sm:block">
              Permissionless Fixed Yield Protocol
            </p>
          </div>
        </div>

        {/* Center: Market Switcher Dropdown */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <select
              value={selectedMarket.id}
              onChange={(e) => {
                const found = APP_CONFIG.markets.find((m) => m.id === e.target.value);
                if (found) setSelectedMarket(found);
              }}
              className="appearance-none bg-slate-900 border border-slate-700 hover:border-cyan-500 text-slate-100 text-sm font-semibold rounded-xl pl-3.5 pr-9 py-2 cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            >
              {APP_CONFIG.markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.isDemo ? ' [DEMO]' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {selectedMarket.isDemo && (
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
              <Sparkles className="w-3 h-3 mr-1 text-amber-400" />
              Demo Yield
            </span>
          )}
        </div>

        {/* Right: Faucet button, Network status & Wallet Button */}
        <div className="flex items-center space-x-3">
          {/* Demo Faucet Button */}
          {selectedMarket.isDemo && (
            <button
              onClick={handleClaimFaucet}
              disabled={isClaimingFaucet}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-semibold text-xs transition shadow-sm active:scale-95 disabled:opacity-50"
              title="Claim 100 free MockLST tokens to test Exodus"
            >
              <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isClaimingFaucet ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isClaimingFaucet ? 'Claiming...' : 'Claim 100 mLST'}</span>
              <span className="sm:hidden">{isClaimingFaucet ? 'Claiming...' : 'Faucet'}</span>
            </button>
          )}

          {/* Testnet indicator */}
          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Testnet</span>
          </div>

          {isConnected && accountId ? (
            <div className="flex items-center space-x-2">
              <a
                href={`${APP_CONFIG.explorerUrl}/address/${accountId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-sm font-mono text-cyan-400 transition"
                title="View on NearBlocks"
              >
                <span>{shortenAddress(accountId, 8)}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
              <button
                onClick={disconnect}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-red-500/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 transition"
                title="Disconnect Wallet"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm shadow-md shadow-cyan-500/20 active:scale-95 transition disabled:opacity-50"
            >
              <Wallet className="w-4 h-4" />
              <span>{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
