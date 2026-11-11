import { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Briefcase,
  ChevronDown,
  CircleHelp,
  Droplets,
  Globe,
  RefreshCw,
  Split,
  TrendingUp,
  Zap,
  BookOpen,
  Menu,
  X,
} from 'lucide-react';
import { WalletProvider, useWallet } from '../context/WalletContext';
import { useProtocolAction } from '../hooks/useProtocolAction';
import { MarketProvider, useMarket } from '../context/MarketContext';
import { Brand, Mark } from '../components/Brand';
import { Navbar } from '../components/Navbar';
import { MarketStats } from '../components/MarketStats';
import { MarketPosition } from '../components/MarketPosition';
import { TxModal } from '../components/TxModal';
import { JudgeTourModal } from '../components/JudgeTourModal';
import { FixYieldTab } from './FixYieldTab';
import { LongYieldTab } from './LongYieldTab';
import { PoolTab } from './PoolTab';
import { MintRedeemTab } from './MintRedeemTab';
import { PortfolioTab } from './PortfolioTab';
import { IntentsTab } from './IntentsTab';
import { APP_CONFIG } from '../config';
import { appHref } from '../lib/navigation';
import type { ActiveTab, TxStatus } from '../types';

const ApyChart = lazy(() =>
  import('../components/ApyChart').then((module) => ({
    default: module.ApyChart,
  })),
);

const tabs = [
  {
    id: 'fix',
    label: 'Fixed yield',
    icon: TrendingUp,
    desc: 'Buy principal tokens at a discount. Redeem for their NEAR value at maturity.',
  },
  {
    id: 'long',
    label: 'Long yield',
    icon: Zap,
    desc: 'Trade future staking yield, without buying the underlying principal.',
  },
  {
    id: 'pool',
    label: 'Liquidity',
    icon: Droplets,
    desc: 'Supply PT and LST to the AMM. Earn a share of the fees from every swap.',
  },
  {
    id: 'mint-redeem',
    label: 'Mint & redeem',
    icon: Split,
    desc: 'Split your LST into principal and yield, or bring the pieces back together.',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: Briefcase,
    desc: 'See your holdings, collect staking yield, and plan your next move.',
  },
  {
    id: 'intents',
    label: 'Cross-chain',
    icon: Globe,
    desc: 'Explore routes to NEAR with live quotes from NEAR Intents.',
  },
] as const;

function Workspace({
  tab,
  marketId,
}: {
  tab: ActiveTab;
  marketId: string | null;
}) {
  const {
    selectedMarket,
    setSelectedMarket,
    marketData,
    error,
    isLoading,
    refresh,
  } = useMarket();
  const [tx, setTx] = useState<TxStatus>({ status: 'idle' });
  const [tour, setTour] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const current = tabs.find((item) => item.id === tab)!;
  const navigate = (id: ActiveTab) => {
    window.location.hash = appHref(id, selectedMarket.id);
    setMobileMenu(false);
  };
  useEffect(() => {
    const market = APP_CONFIG.markets.find((item) => item.id === marketId);
    if (market) setSelectedMarket(market);
  }, [marketId, setSelectedMarket]);
  useEffect(() => {
    setMobileMenu(false);
  }, [tab]);
  useEffect(() => {
    if (!mobileMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenu(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenu]);
  const panel =
    tab === 'fix' ? (
      <FixYieldTab onTxUpdate={setTx} />
    ) : tab === 'long' ? (
      <LongYieldTab onTxUpdate={setTx} />
    ) : tab === 'pool' ? (
      <PoolTab onTxUpdate={setTx} />
    ) : tab === 'mint-redeem' ? (
      <MintRedeemTab onTxUpdate={setTx} />
    ) : tab === 'portfolio' ? (
      <PortfolioTab onTxUpdate={setTx} onNavigateTab={navigate} />
    ) : (
      <IntentsTab />
    );
  return (
    <div className="application">
      <div className="app-backdrop" aria-hidden="true">
        <i /><i /><i />
      </div>
      <a
        className="skip-link"
        href="#app-main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('app-main')?.focus();
        }}
      >
        Skip to workspace
      </a>
      <div className="mobile-app-header">
        <Brand />
        <button
          className="icon-button"
          onClick={() => setMobileMenu(!mobileMenu)}
          aria-label={
            mobileMenu
              ? 'Close workspace navigation'
              : 'Open workspace navigation'
          }
          aria-expanded={mobileMenu}
          aria-controls="workspace-sidebar"
        >
          {mobileMenu ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      <aside
        id="workspace-sidebar"
        className={`app-sidebar ${mobileMenu ? 'sidebar-open' : ''}`}
      >
        <Brand />
        <div className="sidebar-section-label eyebrow">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {tabs.map(({ id, label, icon: Icon }) => (
            <a
              href={appHref(id, selectedMarket.id)}
              key={id}
              aria-current={tab === id ? 'page' : undefined}
              className={tab === id ? 'sidebar-link active' : 'sidebar-link'}
            >
              <Icon size={17} strokeWidth={1.5} />
              <span>{label}</span>
              {id === 'intents' && <span className="sidebar-new">PREVIEW</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="tour-card"
            onClick={() => {
              setTour(true);
              setMobileMenu(false);
            }}
          >
            <CircleHelp size={19} strokeWidth={1.5} />
            <span>
              <strong>New to Exodus?</strong>
              <span>Take the quick tour</span>
            </span>
            <ArrowRight size={15} />
          </button>
          <a
            className="sidebar-resource"
            href="https://github.com/ayoubbuoya/exodus-near#readme"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen size={15} /> Documentation <ArrowUpRight size={13} />
          </a>
          <a className="sidebar-resource" href="#">
            <ArrowLeft size={15} /> Back to website
          </a>
          <div className="sidebar-footer">
            <span className="status-dot" /> NEAR TESTNET <span>v0.1</span>
          </div>
        </div>
      </aside>
      <div className="app-workspace">
        <Navbar title={current.label} />
        <main id="app-main" tabIndex={-1} className="app-main">
          <div className="workspace-title">
            <div>
              <span className="eyebrow">{tab === 'portfolio' ? 'YOUR WORKSPACE' : tab === 'intents' ? 'NEAR INTENTS' : 'YIELD MARKETS'}</span>
              <h1>{current.label}</h1>
              <p>{current.desc}</p>
            </div>
            <button className="help-button" onClick={() => setTour(true)}>
              <CircleHelp size={15} /> Quick tour
            </button>
          </div>
          {tab !== 'intents' && (
          <section className="market-overview" aria-label="Market overview">
          <div className="market-toolbar">
            <div className="market-select-group">
              <span
                className={`asset-avatar ${selectedMarket.isDemo ? 'mock-avatar' : 'linear-avatar'}`}
              >
                {selectedMarket.isDemo ? <Mark /> : <Zap size={19} />}
              </span>
              <div>
                <label htmlFor="market-select" className="eyebrow">
                  SELECTED MARKET
                </label>
                <div className="market-select-wrap">
                  <select
                    id="market-select"
                    value={selectedMarket.id}
                    onChange={(e) => {
                      const next = APP_CONFIG.markets.find(
                        (m) => m.id === e.target.value,
                      );
                      if (next) {
                        setSelectedMarket(next);
                        window.location.hash = appHref(tab, next.id);
                      }
                    }}
                  >
                    {APP_CONFIG.markets.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.asset} · {m.maturityFormatted}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </div>
            </div>
            <div className="market-toolbar-actions">
              <span className="badge">
                {selectedMarket.isDemo ? 'Demo market' : 'Testnet market'}
              </span>
              {marketData?.paused && (
                <span className="badge warning-badge">Paused · exits open</span>
              )}
              <a
                className="icon-button"
                href={`${APP_CONFIG.explorerUrl}/address/${selectedMarket.marketContractId}`}
                target="_blank"
                rel="noreferrer"
                aria-label="View market contract on NearBlocks"
              >
                <ArrowUpRight size={16} />
              </a>
              <button
                className="icon-button"
                onClick={() => void refresh()}
                disabled={isLoading}
                aria-label="Refresh market data"
              >
                <RefreshCw
                  size={14}
                  className={isLoading ? 'animate-spin' : ''}
                />
              </button>
            </div>
          </div>
          {error && (
            <div className="data-notice" role="alert">
              <CircleHelp size={16} />
              <span>{error}</span>
              <button onClick={() => void refresh()} disabled={isLoading}>
                Retry
              </button>
            </div>
          )}
          {selectedMarket.isDemo && (
            <div className="demo-notice">
              <span className="demo-notice-label">DEMO</span>
              <span>
                Real testnet transactions. Simulated staking yield. Get started
                with free MockLST in the panel below.
              </span>
            </div>
          )}
          {tab !== 'portfolio' && <MarketStats />}
          </section>
          )}
          {tab !== 'portfolio' && tab !== 'intents' && (
            <nav className="market-action-nav" aria-label="Market actions">
              {tabs.slice(0, 4).map(({ id, label, icon: Icon }) => (
                <a href={appHref(id, selectedMarket.id)} key={id} aria-current={tab === id ? 'page' : undefined}>
                  <Icon size={15} strokeWidth={1.5} />{label}
                  {(id === 'fix' || id === 'long') && <span>{id === 'fix' ? 'PT' : 'YT'}</span>}
                </a>
              ))}
            </nav>
          )}
          {tab === 'fix' || tab === 'long' ? (
            <>
            <div className="trade-layout">
              <div className="trade-primary" key={`${tab}-${selectedMarket.id}`}>{panel}</div>
              <div className="market-insights">
                <MarketPosition />
                <div className="insight-note">
                  <span
                    className={`token-symbol ${tab === 'fix' ? 'pt-symbol' : 'yt-symbol'}`}
                  >
                    {tab === 'fix' ? 'PT' : 'YT'}
                  </span>
                  <div>
                    <h2>
                      {tab === 'fix'
                        ? 'Fixed yield, explained'
                        : 'Understanding yield tokens'}
                    </h2>
                    <p>
                      {tab === 'fix'
                        ? 'Each PT redeems for 1 NEAR worth of the underlying LST at maturity. Buy at a discount to lock in your NEAR-denominated return. Sell early at the current market price.'
                        : 'Each YT earns the staking yield on 1 NEAR of principal until maturity. Its value depends on future rates and time remaining. After maturity it has no principal value.'}
                    </p>
                    <span>
                      {tab === 'fix'
                        ? 'Subject to smart contract and underlying LST risks.'
                        : 'YT may lose its entire purchase value. Yield fees apply.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <Suspense fallback={<div className="chart-panel chart-empty">Loading yield history…</div>}>
              <ApyChart key={selectedMarket.id} />
            </Suspense>
            <MarketTools onTxUpdate={setTx} />
            </>
          ) : (
            <div
              key={`${tab}-${selectedMarket.id}`}
              className="workspace-panel"
            >
              {panel}
              {tab !== 'intents' && <MarketTools onTxUpdate={setTx} />}
            </div>
          )}
          <footer className="app-footer">
            <span>Experimental software · Unaudited · Testnet only</span>
            <a
              href="https://github.com/ayoubbuoya/exodus-near"
              target="_blank"
              rel="noreferrer"
            >
              Open source on GitHub <ArrowUpRight size={12} />
            </a>
          </footer>
        </main>
      </div>
      <TxModal tx={tx} onClose={() => setTx({ status: 'idle' })} />
      <JudgeTourModal
        key={tour ? 'open' : 'closed'}
        isOpen={tour}
        onClose={() => setTour(false)}
        onNavigateTab={navigate}
      />
    </div>
  );
}

function MarketTools({ onTxUpdate }: { onTxUpdate: (tx: TxStatus) => void }) {
  const { selectedMarket, refresh } = useMarket();
  return (
    <div className="market-tools">
      <div>
        <span className="eyebrow">A HELPING HAND</span>
        <p>
          {selectedMarket.isDemo
            ? 'Need tokens to explore? Claim free MockLST from the faucet.'
            : 'Transactions need a current staking index. Refresh it if the contract reports INDEX_STALE.'}
        </p>
      </div>
      <ProtocolTools onTxUpdate={onTxUpdate} onRefresh={refresh} />
    </div>
  );
}

function ProtocolTools({
  onTxUpdate,
  onRefresh,
}: {
  onTxUpdate: (tx: TxStatus) => void;
  onRefresh: () => Promise<void>;
}) {
  const { selectedMarket } = useMarket();
  const { isConnected, connect, executeTransaction } = useWallet();
  const { busy, run } = useProtocolAction(onTxUpdate);
  const action = (faucet: boolean) => {
    if (!isConnected) {
      void connect();
      return;
    }
    void run(
      faucet ? 'Claim demo tokens' : 'Refresh staking index',
      async () => {
        const result = await executeTransaction(
          faucet
            ? selectedMarket.lstContractId
            : selectedMarket.marketContractId,
          faucet ? 'faucet' : 'refresh_index',
          {},
          '0',
          APP_CONFIG.gasUnits.standard,
        );
        await onRefresh();
        return result;
      },
    );
  };
  return (
    <div className="tool-buttons">
      {selectedMarket.isDemo && (
        <button
          className="button button-quiet button-small"
          disabled={busy}
          onClick={() => action(true)}
        >
          Get demo tokens <ArrowUpRight size={13} />
        </button>
      )}
      <button
        className="text-link"
        disabled={busy}
        onClick={() => action(false)}
      >
        <RefreshCw size={12} /> Refresh index
      </button>
    </div>
  );
}

export default function ApplicationPage(props: {
  tab: ActiveTab;
  marketId: string | null;
}) {
  return (
    <WalletProvider>
      <MarketProvider>
        <Workspace {...props} />
      </MarketProvider>
    </WalletProvider>
  );
}
