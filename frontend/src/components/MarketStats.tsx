import { useMarket } from '../context/MarketContext';
import { CalendarClock, Coins, LockKeyhole, Layers } from 'lucide-react';
import {
  calcImpliedApyPercent,
  formatIndex,
  formatPercent,
  formatUnits,
  getDaysRemaining,
} from '../lib/formatters';

export function MarketStats() {
  const { selectedMarket, marketData, poolData } = useMarket();
  return (
    <div className="market-stats">
      <div>
        <span className="eyebrow"><LockKeyhole size={14} /> FIXED APY</span>
        <strong>
          {poolData && BigInt(poolData.total_lp) > 0n
            ? formatPercent(
                calcImpliedApyPercent(poolData.last_ln_implied_rate),
              )
            : '—'}
        </strong>
        <span>Priced by the AMM</span>
      </div>
      <div>
        <span className="eyebrow"><Layers size={14} /> STAKING INDEX</span>
        <strong>
          {marketData ? formatIndex(marketData.py_index) : '—'}{' '}
          <small>NEAR</small>
        </strong>
        <span>Per underlying LST</span>
      </div>
      <div>
        <span className="eyebrow"><CalendarClock size={14} /> MATURITY</span>
        <strong className="stat-date">
          {selectedMarket.maturityFormatted}
        </strong>
        <span>
          {getDaysRemaining(marketData?.expiry_ns || selectedMarket.expiryNs)}{' '}
          days remaining
        </span>
      </div>
      <div>
        <span className="eyebrow"><Coins size={14} /> POOL RESERVES</span>
        <strong>
          {poolData ? formatUnits(poolData.total_sy, 2) : '—'}{' '}
          <small>{selectedMarket.symbol}</small>
        </strong>
        <span>
          {poolData ? formatUnits(poolData.total_pt, 2) : '—'} PT paired
        </span>
      </div>
    </div>
  );
}
