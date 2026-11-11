import { ArrowRight, Wallet } from 'lucide-react';
import { useMarket } from '../context/MarketContext';
import { useWallet } from '../context/WalletContext';
import { appHref } from '../lib/navigation';
import { formatUnits } from '../lib/formatters';
import { SummaryRow } from './ProtocolUI';

export function MarketPosition() {
  const { selectedMarket, userPosition, lstBalance, balancesReady } = useMarket();
  const { isConnected, isConnecting, connect } = useWallet();
  const amount = (value?: string) =>
    isConnected && balancesReady ? formatUnits(value, 6) : '—';

  return (
    <section className="market-position app-glass" aria-labelledby="position-title">
      <div className="position-heading">
        <h2 id="position-title">Your position</h2>
        <Wallet size={17} aria-hidden="true" />
      </div>
      <p className="position-market">In this {selectedMarket.symbol} market</p>
      <div className="position-balances">
        <SummaryRow label="Principal tokens">
          {amount(userPosition?.pt_balance)} <span className="position-unit">PT</span>
        </SummaryRow>
        <SummaryRow label="Yield tokens">
          <span className="yield-ink">{amount(userPosition?.yt_balance)} YT</span>
        </SummaryRow>
        <SummaryRow label="Liquidity shares">
          {amount(userPosition?.lp_balance)} <span className="position-unit">LP</span>
        </SummaryRow>
        <SummaryRow label="Wallet balance">
          {amount(lstBalance)} <span className="position-unit">{selectedMarket.symbol}</span>
        </SummaryRow>
      </div>
      <div className="position-accrued">
        <span>Claimable yield</span>
        <strong className="yield-ink">
          {amount(userPosition?.accrued_sy)} <small>{selectedMarket.symbol}</small>
        </strong>
      </div>
      {isConnected ? (
        <a className="button button-quiet button-small" href={appHref('portfolio', selectedMarket.id)}>
          Manage position <ArrowRight size={14} />
        </a>
      ) : (
        <>
          <p className="position-connect-note">Connect your wallet to view your balances.</p>
          <button className="button button-quiet button-small" onClick={() => void connect()} disabled={isConnecting}>
            <Wallet size={14} /> {isConnecting ? 'Connecting…' : 'Connect wallet'}
          </button>
        </>
      )}
    </section>
  );
}
