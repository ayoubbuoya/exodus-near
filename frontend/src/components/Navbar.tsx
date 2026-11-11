import { LogOut, ExternalLink, Wallet } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { shortenAddress } from '../lib/formatters';
import { APP_CONFIG } from '../config';
import { ThemeToggle } from './ThemeToggle';

export function Navbar({ title }: { title: string }) {
  const { accountId, isConnecting, connect, disconnect, error } = useWallet();
  return (
    <header className="app-topbar">
      <div className="app-breadcrumb">
        <span>Workspace</span>
        <span>/</span>
        <strong>{title}</strong>
      </div>
      <div className="app-topbar-actions">
        <ThemeToggle />
        <span className="badge">
          <span className="status-dot" />
          <span className="network-label">NEAR Testnet</span>
          <span className="network-label-short">Testnet</span>
        </span>
        {accountId ? (
          <div className="wallet-connected">
            <a
              className="wallet-account"
              href={`${APP_CONFIG.explorerUrl}/address/${accountId}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="account-dot" />
              {shortenAddress(accountId, 8)}
              <ExternalLink size={12} />
            </a>
            <button
              className="icon-button"
              aria-label="Disconnect wallet"
              onClick={disconnect}
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <button
            className="button button-bright button-small"
            onClick={connect}
            disabled={isConnecting}
          >
            <Wallet size={14} />
            {isConnecting ? 'Connecting…' : 'Connect wallet'}
          </button>
        )}
      </div>
      {error && (
        <div className="wallet-error" role="alert">
          {error}
        </div>
      )}
    </header>
  );
}
