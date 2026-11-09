import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { MarketStats } from './components/MarketStats';
import { ApyChart } from './components/ApyChart';
import { TxModal } from './components/TxModal';
import { FixYieldTab } from './pages/FixYieldTab';
import { LongYieldTab } from './pages/LongYieldTab';
import { PoolTab } from './pages/PoolTab';
import { MintRedeemTab } from './pages/MintRedeemTab';
import { PortfolioTab } from './pages/PortfolioTab';
import { IntentsTab } from './pages/IntentsTab';
import { ActiveTab, TxStatus } from './types';
import { TrendingUp, Zap, Droplets, Split, Briefcase, Globe } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('fix');
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: 'idle' });

  const tabs = [
    { id: 'fix' as ActiveTab, label: 'Fix Yield', icon: TrendingUp, desc: 'Buy & Sell PT' },
    { id: 'long' as ActiveTab, label: 'Long Yield', icon: Zap, desc: 'Leveraged Staking Yield' },
    { id: 'pool' as ActiveTab, label: 'Pool', icon: Droplets, desc: 'Provide Liquidity' },
    { id: 'mint-redeem' as ActiveTab, label: 'Mint / Redeem', icon: Split, desc: 'Tokenize LST' },
    { id: 'portfolio' as ActiveTab, label: 'Portfolio', icon: Briefcase, desc: 'Balances & Claims' },
    { id: 'intents' as ActiveTab, label: 'Cross-Chain', icon: Globe, desc: 'Deposit via NEAR Intents' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <Navbar onTxUpdate={setTxStatus} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Market Stats Bar */}
        <MarketStats />

        {/* APY History Chart */}
        <ApyChart />

        {/* Protocol Tab Navigation Bar */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex p-1.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl overflow-x-auto max-w-full">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center space-x-2 px-4 sm:px-6 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Panes */}
        <div className="mb-12">
          {activeTab === 'fix' && <FixYieldTab onTxUpdate={setTxStatus} />}
          {activeTab === 'long' && <LongYieldTab onTxUpdate={setTxStatus} />}
          {activeTab === 'pool' && <PoolTab onTxUpdate={setTxStatus} />}
          {activeTab === 'mint-redeem' && <MintRedeemTab onTxUpdate={setTxStatus} />}
          {activeTab === 'portfolio' && (
            <PortfolioTab onTxUpdate={setTxStatus} onNavigateTab={setActiveTab} />
          )}
          {activeTab === 'intents' && <IntentsTab onTxUpdate={setTxStatus} />}
        </div>
      </main>

      {/* Global Transaction Status Modal */}
      <TxModal tx={txStatus} onClose={() => setTxStatus({ status: 'idle' })} />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-300">Exodus on NEAR</span>
            <span>•</span>
            <span>Pendle V2 Logit Curve AMM for Liquid Staking</span>
          </div>

          <div className="text-center md:text-right text-[11px] space-y-1">
            <p>
              Built for the <strong className="text-slate-400">NEAR Hackathon 2026</strong>.
              Prior work: Exodus on Canton (Daml, HackCanton S3 2nd place).
            </p>
            <p className="text-slate-600">
              Experimental hackathon software. Not audited. Testnet only.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
