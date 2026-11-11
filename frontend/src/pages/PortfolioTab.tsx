import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Coins,
  Droplets,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useMarket } from '../context/MarketContext';
import { useWallet } from '../context/WalletContext';
import { useProtocolAction } from '../hooks/useProtocolAction';
import { formatUnits, shortenAddress } from '../lib/formatters';
import { APP_CONFIG } from '../config';
import type { ActiveTab, TxStatus } from '../types';

export function PortfolioTab({
  onTxUpdate,
  onNavigateTab,
}: {
  onTxUpdate: (tx: TxStatus) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}) {
  const { selectedMarket, userPosition, lstBalance, balancesReady, refresh } =
    useMarket();
  const { isConnected, isConnecting, accountId, connect, executeTransaction } =
    useWallet();
  const { busy, run } = useProtocolAction(onTxUpdate);
  if (!isConnected)
    return (
      <section className="portfolio-empty">
        <div className="portfolio-empty-art">
          <img
            src="/glass/hero-joined-sm.webp"
            alt=""
            width="768"
            height="512"
          />
        </div>
        <span className="eyebrow">YOUR OWN CORNER OF EXODUS</span>
        <h2>
          A clearer picture
          <br />
          <span className="muted">starts here.</span>
        </h2>
        <p>
          Connect your NEAR testnet wallet to see your principal, yield,
          liquidity positions, and claimable rewards.
        </p>
        <button
          className="button button-bright"
          onClick={connect}
          disabled={isConnecting}
        >
          <Wallet size={15} />
          {isConnecting ? 'Connecting…' : 'Connect wallet'}
          <ArrowRight size={15} />
        </button>
        <span className="panel-footnote">
          Your assets stay in your wallet. You sign every transaction.
        </span>
      </section>
    );
  const positions = [
    {
      label: 'Principal tokens',
      unit: 'PT',
      amount: userPosition?.pt_balance,
      icon: Coins,
      desc: 'Redeems for NEAR value at maturity',
      tab: 'fix' as ActiveTab,
      action: 'Trade principal',
    },
    {
      label: 'Yield tokens',
      unit: 'YT',
      amount: userPosition?.yt_balance,
      icon: Sparkles,
      desc: 'Staking yield until maturity',
      tab: 'long' as ActiveTab,
      action: 'Trade yield',
    },
    {
      label: 'Liquidity shares',
      unit: 'LP',
      amount: userPosition?.lp_balance,
      icon: Droplets,
      desc: 'Your proportional share of the AMM',
      tab: 'pool' as ActiveTab,
      action: 'Manage liquidity',
    },
    {
      label: 'Wallet balance',
      unit: selectedMarket.symbol,
      amount: lstBalance,
      icon: Wallet,
      desc: 'Available underlying staking tokens',
      tab: 'mint-redeem' as ActiveTab,
      action: 'Mint & redeem',
    },
  ];
  const claim = () =>
    void run('Claim staking yield', async () => {
      const tx = await executeTransaction(
        selectedMarket.marketContractId,
        'claim_interest',
        {},
        '1',
        APP_CONFIG.gasUnits.standard,
      );
      await refresh();
      return tx;
    });
  return (
    <div className="portfolio">
      <div className="portfolio-account">
        <span>
          <Briefcase size={15} /> YOUR CONNECTED WALLET
        </span>
        <a
          href={`${APP_CONFIG.explorerUrl}/address/${accountId}`}
          target="_blank"
          rel="noreferrer"
        >
          {shortenAddress(accountId || '', 15)}
          <ArrowUpRight size={14} />
        </a>
      </div>
      <section className="claim-panel">
        <div>
          <span className="eyebrow">A LITTLE SOMETHING ACCRUED</span>
          <h2>Yield, ready when you are.</h2>
          <p>Staking interest earned by your YT in the selected market.</p>
        </div>
        <div className="claim-value">
          <strong>
            {balancesReady ? formatUnits(userPosition?.accrued_sy, 8) : '—'}
          </strong>
          <span>{selectedMarket.symbol}</span>
        </div>
        <button
          className="button button-bright button-small"
          onClick={claim}
          disabled={busy}
        >
          {busy ? 'Claiming…' : 'Claim yield'}
          <ArrowUpRight size={14} />
        </button>
      </section>
      <div className="position-grid">
        {positions.map(
          ({ label, unit, amount, icon: Icon, desc, tab, action }) => (
            <section
              className={`position-card ${unit === 'YT' ? 'yield-position' : ''}`}
              key={label}
            >
              <div className="position-top">
                <span
                  className={`token-symbol ${unit === 'YT' ? 'yt-symbol' : 'pt-symbol'}`}
                >
                  <Icon size={16} />
                </span>
                <span>{label}</span>
                <span className="eyebrow">{unit}</span>
              </div>
              <strong>
                {balancesReady ? formatUnits(amount, 6) : '—'}
                <small>{unit}</small>
              </strong>
              <p>{desc}</p>
              <button className="text-link" onClick={() => onNavigateTab(tab)}>
                {action}
                <ArrowRight size={14} />
              </button>
            </section>
          ),
        )}
      </div>
      <div className="portfolio-next">
        <div>
          <h3>Ready for your next move?</h3>
          <p>Redeem paired PT + YT at any time, or PT alone after maturity.</p>
        </div>
        <button
          className="button button-quiet button-small"
          onClick={() => onNavigateTab('mint-redeem')}
        >
          Mint & redeem
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
