import { useState } from 'react';
import { Droplets, Plus } from 'lucide-react';
import {
  ActionButton,
  AmountField,
  FormNotice,
  SlippageControl,
  SummaryRow,
} from '../components/ProtocolUI';
import { useMarket } from '../context/MarketContext';
import { useWallet } from '../context/WalletContext';
import { useProtocolAction } from '../hooks/useProtocolAction';
import { formatUnits, safeAmount } from '../lib/formatters';
import { estimateLp } from '../lib/liquidity';
import { APP_CONFIG } from '../config';
import type { TxStatus } from '../types';

export function PoolTab({
  onTxUpdate,
}: {
  onTxUpdate: (tx: TxStatus) => void;
}) {
  const {
    selectedMarket,
    marketData,
    poolData,
    userPosition,
    lstBalance,
    balancesReady,
    refresh,
  } = useMarket();
  const { isConnected, connect, executeTransaction } = useWallet();
  const { busy, run } = useProtocolAction(onTxUpdate);
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [sy, setSy] = useState('');
  const [pt, setPt] = useState('');
  const [lp, setLp] = useState('');
  const [slippage, setSlippage] = useState(50);
  const totalSy = BigInt(poolData?.total_sy || '0'),
    totalPt = BigInt(poolData?.total_pt || '0'),
    totalLp = BigInt(poolData?.total_lp || '0');
  const syIn = safeAmount(sy),
    ptIn = safeAmount(pt),
    lpIn = safeAmount(lp);
  const estimate = estimateLp(syIn, ptIn, totalSy, totalPt, totalLp);
  const ptOut = totalLp > 0n ? (lpIn * totalPt) / totalLp : 0n,
    syOut = totalLp > 0n ? (lpIn * totalSy) / totalLp : 0n;
  const hasReserves = totalSy > 0n && totalPt > 0n;
  function changeSy(value: string) {
    setSy(value);
    if (hasReserves)
      setPt(
        formatUnits((safeAmount(value) * totalPt + totalSy - 1n) / totalSy, 24),
      );
  }
  function changePt(value: string) {
    setPt(value);
    if (hasReserves)
      setSy(
        formatUnits((safeAmount(value) * totalSy + totalPt - 1n) / totalPt, 24),
      );
  }
  const insufficient =
    balancesReady &&
    (mode === 'add'
      ? syIn > BigInt(lstBalance) ||
        ptIn > BigInt(userPosition?.pt_balance || '0')
      : lpIn > BigInt(userPosition?.lp_balance || '0'));
  const blocked =
    mode === 'add' &&
    (!marketData ||
      marketData.paused ||
      Date.now() >= marketData.expiry_ns / 1e6);
  const invalid =
    mode === 'add'
      ? syIn <= 0n || ptIn <= 0n || estimate <= 0n || !poolData
      : lpIn <= 0n;
  const min = (amount: bigint) =>
    ((amount * BigInt(10000 - slippage)) / 10000n).toString();
  async function submit() {
    if (!isConnected) {
      await connect();
      return;
    }
    if (
      invalid ||
      insufficient ||
      blocked ||
      (mode === 'add' && !balancesReady)
    )
      return;
    await run(
      mode === 'add' ? 'Add liquidity' : 'Remove liquidity',
      async () => {
        const tx =
          mode === 'add'
            ? await executeTransaction(
                selectedMarket.lstContractId,
                'ft_transfer_call',
                {
                  receiver_id: selectedMarket.marketContractId,
                  amount: syIn.toString(),
                  msg: JSON.stringify({
                    action: 'add_liquidity',
                    pt_desired: ptIn.toString(),
                    min_lp_out: min(estimate),
                  }),
                },
                '1',
                APP_CONFIG.gasUnits.swap,
              )
            : await executeTransaction(
                selectedMarket.marketContractId,
                'remove_liquidity',
                {
                  lp: lpIn.toString(),
                  min_pt_out: min(ptOut),
                  min_sy_out: min(syOut),
                },
                '1',
                APP_CONFIG.gasUnits.swap,
              );
        await refresh();
        return tx;
      },
    );
  }
  return (
    <div className="pool-layout">
      <section className="pool-story">
        <span className="eyebrow">A SHARE IN THE FLOW</span>
        <h2>
          Put liquidity
          <br />
          <span className="muted">to work.</span>
        </h2>
        <div className="pool-illustration" aria-hidden="true">
          <span className="pool-orbit orbit-one" />
          <span className="pool-orbit orbit-two" />
          <span className="orbit-token orbit-pt">PT</span>
          <span className="orbit-token orbit-lst">{selectedMarket.symbol}</span>
          <Droplets size={32} strokeWidth={1} />
        </div>
        <div className="trade-summary">
          <SummaryRow label="Your LP position">
            {balancesReady ? formatUnits(userPosition?.lp_balance, 6) : '—'} LP
          </SummaryRow>
          <SummaryRow label="Pool ownership">
            {balancesReady && totalLp > 0n
              ? `${(Number((BigInt(userPosition?.lp_balance || '0') * 10000n) / totalLp) / 100).toFixed(2)}%`
              : '—'}
          </SummaryRow>
          <SummaryRow label="Total LP shares">
            {poolData ? formatUnits(totalLp, 6) : '—'}
          </SummaryRow>
        </div>
        <p>
          Supply both PT and LST in the pool’s current ratio. Fees accrue to the
          pool. Withdraw your proportional share of both assets at any time.
        </p>
        <a
          className="text-link"
          href={`#/app/mint-redeem?market=${selectedMarket.id}`}
        >
          Need PT? Split your LST first <Plus size={13} />
        </a>
        <FormNotice>
          LP positions carry market, underlying asset, and smart contract risk.
          Returns are not guaranteed.
        </FormNotice>
      </section>
      <form
        className="trade-panel"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="panel-heading">
          <span className="token-symbol pt-symbol">
            <Droplets size={17} />
          </span>
          <div>
            <h2>
              {mode === 'add' ? 'Keep the market moving.' : 'Take your share.'}
            </h2>
            <p>PT / {selectedMarket.symbol} liquidity</p>
          </div>
        </div>
        <div className="segmented">
          {(['add', 'remove'] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={mode === value ? 'selected' : ''}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === 'add' ? 'Add liquidity' : 'Remove liquidity'}
            </button>
          ))}
        </div>
        {mode === 'add' ? (
          <>
            <AmountField
              label="Deposit LST"
              token={selectedMarket.symbol}
              value={sy}
              onChange={changeSy}
              balance={
                isConnected
                  ? balancesReady
                    ? formatUnits(lstBalance, 6)
                    : '—'
                  : undefined
              }
              onMax={
                balancesReady
                  ? () => changeSy(formatUnits(lstBalance, 24))
                  : undefined
              }
            />
            <div className="swap-divider">
              <Plus size={14} />
            </div>
            <AmountField
              label="Pair with principal"
              token="PT"
              value={pt}
              onChange={changePt}
              balance={
                isConnected
                  ? balancesReady
                    ? formatUnits(userPosition?.pt_balance, 6)
                    : '—'
                  : undefined
              }
              onMax={
                balancesReady
                  ? () => changePt(formatUnits(userPosition?.pt_balance, 24))
                  : undefined
              }
            />
            <div className="trade-summary">
              <SummaryRow label="Estimated LP shares">
                {poolData ? formatUnits(estimate, 6) : '—'} LP
              </SummaryRow>
              <SummaryRow label="Minimum LP shares">
                {poolData ? formatUnits(min(estimate), 6) : '—'} LP
              </SummaryRow>
              <SummaryRow label="Pool ratio">
                {hasReserves
                  ? `${formatUnits((totalPt * 10n ** 24n) / totalSy, 6)} PT / LST`
                  : 'Initial liquidity'}
              </SummaryRow>
            </div>
          </>
        ) : (
          <>
            <AmountField
              label="LP shares to burn"
              token="LP"
              value={lp}
              onChange={setLp}
              balance={
                isConnected
                  ? balancesReady
                    ? formatUnits(userPosition?.lp_balance, 6)
                    : '—'
                  : undefined
              }
              onMax={
                balancesReady
                  ? () => setLp(formatUnits(userPosition?.lp_balance, 24))
                  : undefined
              }
            />
            <div className="trade-summary">
              <SummaryRow label="Estimated principal">
                {poolData ? formatUnits(ptOut, 6) : '—'} PT
              </SummaryRow>
              <SummaryRow label="Estimated LST">
                {poolData ? formatUnits(syOut, 6) : '—'} {selectedMarket.symbol}
              </SummaryRow>
            </div>
            <FormNotice>
              Withdrawals remain available when a market is paused or has
              matured.
            </FormNotice>
          </>
        )}
        <SlippageControl value={slippage} onChange={setSlippage} />
        {insufficient && (
          <FormNotice error>
            Insufficient {mode === 'add' ? 'PT or LST' : 'LP'} balance.
          </FormNotice>
        )}
        {blocked && (
          <FormNotice>
            New liquidity requires an active, unpaused market. You can still
            remove liquidity.
          </FormNotice>
        )}
        <ActionButton
          busy={busy}
          disabled={
            isConnected &&
            (invalid ||
              insufficient ||
              !!blocked ||
              (mode === 'add' && !balancesReady))
          }
        >
          {!isConnected
            ? 'Connect wallet'
            : mode === 'add'
              ? 'Supply liquidity'
              : 'Withdraw liquidity'}
        </ActionButton>
        <p className="panel-footnote">
          Final amounts depend on the pool at execution.
        </p>
      </form>
    </div>
  );
}
