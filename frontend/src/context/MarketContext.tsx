import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { APP_CONFIG, type MarketConfig } from '../config';
import type { MarketView, PoolView, UserPositionView } from '../types';
import { fetchFtBalance, fetchMarketView, fetchPoolView, fetchUserPosition } from '../lib/rpc';
import { useWallet } from './WalletContext';

interface MarketContextType {
  selectedMarket: MarketConfig;
  setSelectedMarket: (m: MarketConfig) => void;
  marketData: MarketView | null;
  poolData: PoolView | null;
  userPosition: UserPositionView | null;
  lstBalance: string;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const MarketContext = createContext<MarketContextType | null>(null);

export const MarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedMarket, setSelectedMarket] = useState<MarketConfig>(APP_CONFIG.markets[0]);
  const [marketData, setMarketData] = useState<MarketView | null>(null);
  const [poolData, setPoolData] = useState<PoolView | null>(null);
  const [userPosition, setUserPosition] = useState<UserPositionView | null>(null);
  const [lstBalance, setLstBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { accountId } = useWallet();

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch Market & Pool views in parallel
      const [mView, pView] = await Promise.all([
        fetchMarketView(selectedMarket.marketContractId).catch((err) => {
          console.warn('Market view fetch failed:', err);
          return null;
        }),
        fetchPoolView(selectedMarket.marketContractId).catch((err) => {
          console.warn('Pool view fetch failed:', err);
          return null;
        }),
      ]);

      setMarketData(mView);
      setPoolData(pView);

      // 2. Fetch User balances if wallet is connected
      if (accountId) {
        const [uPos, ftBal] = await Promise.all([
          fetchUserPosition(selectedMarket.marketContractId, accountId).catch(() => null),
          fetchFtBalance(selectedMarket.lstContractId, accountId).catch(() => '0'),
        ]);
        setUserPosition(uPos);
        setLstBalance(ftBal);
      } else {
        setUserPosition(null);
        setLstBalance('0');
      }
    } catch (err: any) {
      console.error('Error refreshing market state:', err);
      setError(err?.message || 'Failed to load market state');
    } finally {
      setIsLoading(false);
    }
  }, [selectedMarket, accountId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000); // Auto-refresh every 15s
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <MarketContext.Provider
      value={{
        selectedMarket,
        setSelectedMarket,
        marketData,
        poolData,
        userPosition,
        lstBalance,
        isLoading,
        error,
        refresh,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
};

export const useMarket = () => {
  const ctx = useContext(MarketContext);
  if (!ctx) {
    throw new Error('useMarket must be used within a MarketProvider');
  }
  return ctx;
};
