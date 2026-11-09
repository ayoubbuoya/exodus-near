import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { NearConnector } from '@hot-labs/near-connect';
import { APP_CONFIG } from '../config';

interface ActionCall {
  type: 'FunctionCall';
  params: {
    methodName: string;
    args: Record<string, any>;
    gas: string;
    deposit: string;
  };
}

interface WalletContextType {
  accountId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  executeTransaction: (
    receiverId: string,
    methodName: string,
    args: Record<string, any>,
    depositYocto?: string,
    gas?: string
  ) => Promise<any>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Initialize NearConnector
  const connector = useMemo(() => {
    return new NearConnector({
      // Configure testnet
      network: APP_CONFIG.networkId as 'testnet',
    });
  }, []);

  // Sync active account on mount and listen to connector events
  useEffect(() => {
    let mounted = true;

    async function checkExistingAuth() {
      try {
        const wallet = await connector.wallet();
        if (wallet) {
          const accounts = await wallet.getAccounts();
          if (mounted && accounts && accounts.length > 0) {
            setAccountId(accounts[0].accountId);
          }
        }
      } catch {
        // No pre-existing connected wallet
      }
    }

    checkExistingAuth();

    connector.on('wallet:signIn', (event: any) => {
      if (event?.accounts?.[0]?.accountId) {
        setAccountId(event.accounts[0].accountId);
      }
    });

    connector.on('wallet:signOut', () => {
      setAccountId(null);
    });

    return () => {
      mounted = false;
    };
  }, [connector]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      await connector.connect();
      const wallet = await connector.wallet();
      if (wallet) {
        const accounts = await wallet.getAccounts();
        if (accounts && accounts.length > 0) {
          setAccountId(accounts[0].accountId);
        }
      }
    } catch (err) {
      console.error('Wallet connection failed:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [connector]);

  const disconnect = useCallback(async () => {
    try {
      const wallet = await connector.wallet();
      if (wallet && typeof wallet.signOut === 'function') {
        await wallet.signOut();
      }
      setAccountId(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }, [connector]);

  const executeTransaction = useCallback(
    async (
      receiverId: string,
      methodName: string,
      args: Record<string, any>,
      depositYocto: string = '1',
      gas: string = APP_CONFIG.gasUnits.standard
    ) => {
      const wallet = await connector.wallet();
      if (!wallet) {
        throw new Error('Please connect your NEAR wallet first.');
      }

      const action: ActionCall = {
        type: 'FunctionCall',
        params: {
          methodName,
          args,
          gas,
          deposit: depositYocto,
        },
      };

      // Call signAndSendTransaction compatible with NEAR Connect
      return await wallet.signAndSendTransaction({
        receiverId,
        actions: [action],
      });
    },
    [connector]
  );

  return (
    <WalletContext.Provider
      value={{
        accountId,
        isConnected: !!accountId,
        isConnecting,
        connect,
        disconnect,
        executeTransaction,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return ctx;
};
