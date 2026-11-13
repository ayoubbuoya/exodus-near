import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { NearConnector } from '@hot-labs/near-connect';
import { APP_CONFIG } from '../config';
import { assertTransactionSucceeded } from '../lib/transactions';

// One connector per app module; Strict Mode must not create duplicate wallet selectors.
const connector = new NearConnector({
  network: APP_CONFIG.networkId as 'testnet',
});
interface WalletContextType {
  accountId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  executeTransaction: (
    receiverId: string,
    methodName: string,
    args: Record<string, any>,
    depositYocto?: string,
    gas?: string,
  ) => Promise<any>;
}
const WalletContext = createContext<WalletContextType | null>(null);
export function WalletProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void connector
      .getConnectedWallet()
      .then(({ accounts }) => {
        if (active) setAccountId(accounts[0]?.accountId || null);
      })
      .catch(() => {});
    const onSignIn = (event: any) => {
      if (active) setAccountId(event.accounts?.[0]?.accountId || null);
    };
    const onSignOut = () => {
      if (active) setAccountId(null);
    };
    connector.on('wallet:signIn', onSignIn);
    connector.on('wallet:signOut', onSignOut);
    return () => {
      active = false;
      connector.off('wallet:signIn', onSignIn);
      connector.off('wallet:signOut', onSignOut);
    };
  }, []);
  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const wallet = await connector.connect();
      const accounts = await wallet.getAccounts();
      setAccountId(accounts[0]?.accountId || null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Wallet connection failed. Please try again.',
      );
    } finally {
      setConnecting(false);
    }
  }, []);
  const disconnect = useCallback(async () => {
    setError(null);
    try {
      await connector.disconnect();
      setAccountId(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not disconnect your wallet.',
      );
    }
  }, []);
  const executeTransaction = useCallback(
    async (
      receiverId: string,
      methodName: string,
      args: Record<string, any>,
      depositYocto = '1',
      gas = APP_CONFIG.gasUnits.standard,
    ) => {
      const wallet = await connector.wallet();
      if (!wallet) throw new Error('Please connect your NEAR wallet first.');
      const result = await wallet.signAndSendTransaction({
        receiverId,
        actions: [
          {
            type: 'FunctionCall',
            params: { methodName, args, gas, deposit: depositYocto },
          },
        ],
      });
      assertTransactionSucceeded(result, methodName);
      return result;
    },
    [],
  );
  return (
    <WalletContext.Provider
      value={{
        accountId,
        isConnected: !!accountId,
        isConnecting,
        error,
        connect,
        disconnect,
        executeTransaction,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet requires WalletProvider');
  return context;
}
