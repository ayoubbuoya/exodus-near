import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { APP_CONFIG, type MarketConfig } from '../config';
import type { MarketView, PoolView, UserPositionView } from '../types';
import {
  fetchFtBalance,
  fetchMarketView,
  fetchPoolView,
  fetchUserPosition,
} from '../lib/rpc';
import { useWallet } from './WalletContext';

interface MarketContextType {
  selectedMarket: MarketConfig;
  setSelectedMarket: (m: MarketConfig) => void;
  marketData: MarketView | null;
  poolData: PoolView | null;
  userPosition: UserPositionView | null;
  lstBalance: string;
  balancesReady: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}
const MarketContext = createContext<MarketContextType | null>(null);
interface Snapshot {
  key: string;
  market: MarketView | null;
  pool: PoolView | null;
  user: UserPositionView | null;
  lst: string;
  balancesReady: boolean;
}

export function MarketProvider({ children }: { children: ReactNode }) {
  const [selectedMarket, setSelectedMarket] = useState<MarketConfig>(
    APP_CONFIG.markets[0],
  );
  const { accountId } = useWallet();
  const key = `${selectedMarket.id}:${accountId || ''}`;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++version.current;
    setLoading(true);
    const [market, pool, user, balance] = await Promise.allSettled([
      fetchMarketView(selectedMarket.marketContractId),
      fetchPoolView(selectedMarket.marketContractId),
      accountId
        ? fetchUserPosition(selectedMarket.marketContractId, accountId)
        : Promise.resolve(null),
      accountId
        ? fetchFtBalance(selectedMarket.lstContractId, accountId)
        : Promise.resolve('0'),
    ]);
    if (request !== version.current) return;
    const balancesReady =
      !!accountId &&
      user.status === 'fulfilled' &&
      balance.status === 'fulfilled';
    setSnapshot({
      key,
      market: market.status === 'fulfilled' ? market.value : null,
      pool: pool.status === 'fulfilled' ? pool.value : null,
      user: user.status === 'fulfilled' ? user.value : null,
      lst: balance.status === 'fulfilled' ? balance.value : '0',
      balancesReady,
    });
    setError(
      market.status === 'rejected' || pool.status === 'rejected'
        ? 'Market data could not be fully loaded. Check your connection and retry.'
        : accountId && !balancesReady
          ? 'Wallet balances could not be loaded. Refresh before entering a new position.'
          : null,
    );
    setLoading(false);
  }, [selectedMarket, accountId, key]);
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => {
      version.current++;
      window.clearInterval(interval);
    };
  }, [refresh]);
  const current = snapshot?.key === key ? snapshot : null;
  return (
    <MarketContext.Provider
      value={{
        selectedMarket,
        setSelectedMarket,
        marketData: current?.market || null,
        poolData: current?.pool || null,
        userPosition: current?.user || null,
        lstBalance: current?.lst || '0',
        balancesReady: current?.balancesReady || false,
        isLoading: isLoading || !current,
        error,
        refresh,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
}
export function useMarket() {
  const value = useContext(MarketContext);
  if (!value) throw new Error('useMarket requires MarketProvider');
  return value;
}
