import { useEffect, useState } from 'react';
import { ArrowDown, Clock, LockKeyhole, Zap } from 'lucide-react';
import { useMarket } from '../context/MarketContext';
import { useWallet } from '../context/WalletContext';
import { useProtocolAction } from '../hooks/useProtocolAction';
import {
  AmountField,
  ActionButton,
  FormNotice,
  SlippageControl,
  SummaryRow,
} from './ProtocolUI';
import { APP_CONFIG } from '../config';
import {
  calcImpliedApyPercent,
  formatPercent,
  formatUnits,
  safeAmount,
} from '../lib/formatters';
import {
  fetchPreviewSyForPt,
  fetchPreviewPtForSy,
  fetchPreviewSyForYt,
  fetchPreviewYtForSy,
} from '../lib/rpc';
import type { SwapPreviewView, TxStatus } from '../types';

export function TradePanel({
  token,
  onTxUpdate,
}: {
  token: 'PT' | 'YT';
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
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(APP_CONFIG.defaultSlippageBps);
  const [quote, setQuote] = useState<{
    key: string;
    value: SwapPreviewView;
  } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const input = safeAmount(amount);
  const quoteKey = `${selectedMarket.id}:${mode}:${token}:${input}`;
  const activeQuote = quote?.key === quoteKey ? quote.value : null;
  const balance =
    mode === 'buy'
      ? lstBalance
      : token === 'PT'
        ? userPosition?.pt_balance || '0'
        : userPosition?.yt_balance || '0';
  const insufficient = isConnected && balancesReady && input > BigInt(balance);
  const matured =
    Date.now() >= (marketData?.expiry_ns || selectedMarket.expiryNs) / 1e6;
  const paused = marketData?.paused;
  const apy =
    poolData && BigInt(poolData.total_lp) > 0n
      ? calcImpliedApyPercent(poolData.last_ln_implied_rate)
      : NaN;
  const minOut = activeQuote
    ? (BigInt(activeQuote.amount_out) * BigInt(10000 - slippage)) / 10000n
    : 0n;
  useEffect(() => {
    let active = true;
    setQuoteError(null);
    setQuote(null);
    setQuoting(input > 0n && !matured && !paused);
    if (input <= 0n || matured || paused) return;
    const timer = window.setTimeout(async () => {
      try {
        const preview =
          token === 'PT'
            ? mode === 'buy'
              ? fetchPreviewSyForPt
              : fetchPreviewPtForSy
            : mode === 'buy'
              ? fetchPreviewSyForYt
              : fetchPreviewYtForSy;
        const result = await preview(
          selectedMarket.marketContractId,
          input.toString(),
        );
        if (active) setQuote({ key: quoteKey, value: result });
      } catch {
        if (active)
          setQuoteError(
            'A quote is unavailable. Check pool liquidity and refresh the market.',
          );
      } finally {
        if (active) setQuoting(false);
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    input,
    selectedMarket.marketContractId,
    mode,
    token,
    quoteKey,
    matured,
    paused,
    poolData,
  ]);
  const submit = async () => {
    if (!isConnected) {
      await connect();
      return;
    }
    if (
      !activeQuote ||
      input <= 0n ||
      insufficient ||
      !balancesReady ||
      paused ||
      matured
    )
      return;
    await run(`${mode === 'buy' ? 'Buy' : 'Sell'} ${token}`, async () => {
      const lower = token.toLowerCase();
      const result =
        mode === 'buy'
          ? await executeTransaction(
              selectedMarket.lstContractId,
              'ft_transfer_call',
              {
                receiver_id: selectedMarket.marketContractId,
                amount: input.toString(),
                msg: JSON.stringify({
                  action: `swap_exact_sy_for_${lower}`,
                  [`min_${lower}_out`]: minOut.toString(),
                }),
              },
              '1',
              APP_CONFIG.gasUnits.swap,
            )
          : await executeTransaction(
              selectedMarket.marketContractId,
              `swap_exact_${lower}_for_sy`,
              {
                [`${lower}_in`]: input.toString(),
                min_sy_out: minOut.toString(),
              },
              '1',
              APP_CONFIG.gasUnits.swap,
            );
      await refresh();
      return result;
    });
  };
  return (
    <form
      className={`trade-panel ${token === 'YT' ? 'yield-panel' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="panel-heading">
        <span
          className={`token-symbol ${token === 'PT' ? 'pt-symbol' : 'yt-symbol'}`}
        >
          {token}
        </span>
        <div>
          <h2>{token === 'PT' ? 'Trade principal' : 'Trade yield'}</h2>
          <p>
            {token === 'PT' ? 'Principal token' : 'Yield token'} ·{' '}
            {selectedMarket.symbol}
          </p>
        </div>
        {token === 'PT' ? <LockKeyhole size={17} /> : <Zap size={17} />}
      </div>
      <div className="segmented" aria-label="Trade direction">
        {(['buy', 'sell'] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={mode === value}
            className={mode === value ? 'selected' : ''}
            onClick={() => {
              setMode(value);
              setAmount('');
            }}
          >
            {value === 'buy' ? `Buy ${token}` : `Sell ${token}`}
          </button>
        ))}
      </div>
      <AmountField
        label="You pay"
        value={amount}
        onChange={setAmount}
        token={mode === 'buy' ? selectedMarket.symbol : token}
        balance={
          isConnected
            ? balancesReady
              ? formatUnits(balance, 6)
              : '—'
            : undefined
        }
        onMax={
          balancesReady ? () => setAmount(formatUnits(balance, 24)) : undefined
        }
      />
      <div className="swap-divider">
        <ArrowDown size={14} />
      </div>
      <div className="trade-output">
        <span>Estimated receive</span>
        <div>
          <strong
            className={token === 'YT' && mode === 'buy' ? 'yield-ink' : ''}
          >
            {quoting
              ? '…'
              : activeQuote
                ? formatUnits(activeQuote.amount_out, 6)
                : '—'}
          </strong>
          <span>{mode === 'buy' ? token : selectedMarket.symbol}</span>
        </div>
      </div>
      <div className="trade-summary">
        <SummaryRow
          label={token === 'PT' ? 'Market implied APY' : 'Break-even APY'}
        >
          {formatPercent(apy)}
        </SummaryRow>
        <SummaryRow label="Maturity">
          <Clock size={11} /> {selectedMarket.maturityFormatted}
        </SummaryRow>
        <SummaryRow label="Minimum received">
          {activeQuote ? formatUnits(minOut, 6) : '—'}{' '}
          {mode === 'buy' ? token : selectedMarket.symbol}
        </SummaryRow>
        <SummaryRow label="Protocol fee">
          {activeQuote ? formatUnits(activeQuote.fee_sy, 6) : '—'}{' '}
          {selectedMarket.symbol}
        </SummaryRow>
      </div>
      <SlippageControl value={slippage} onChange={setSlippage} />
      {quoteError && <FormNotice error>{quoteError}</FormNotice>}
      {insufficient && (
        <FormNotice error>
          Insufficient {mode === 'buy' ? selectedMarket.symbol : token} balance.
        </FormNotice>
      )}
      {matured ? (
        <FormNotice>
          This market has matured.{' '}
          <a
            href={`#/app/${token === 'PT' ? 'mint-redeem' : 'portfolio'}?market=${selectedMarket.id}`}
          >
            {token === 'PT' ? 'Redeem your PT' : 'Claim accrued yield'}{' '}
            <ArrowDown size={12} />
          </a>
        </FormNotice>
      ) : (
        paused && (
          <FormNotice>
            Trading is paused. Redemption, claims, and liquidity withdrawals
            remain available.
          </FormNotice>
        )
      )}
      <ActionButton
        busy={busy}
        disabled={
          isConnected &&
          (input <= 0n ||
            !activeQuote ||
            BigInt(activeQuote.amount_out) <= 0n ||
            quoting ||
            insufficient ||
            !balancesReady ||
            !!paused ||
            matured)
        }
      >
        {!isConnected
          ? 'Connect wallet'
          : input <= 0n
            ? 'Enter an amount'
            : quoting
              ? 'Fetching quote…'
              : `${mode === 'buy' ? 'Buy' : 'Sell'} ${token}`}
      </ActionButton>
      <p className="panel-footnote">
        {token === 'PT'
          ? 'Fixed return applies when held to maturity.'
          : 'YT stops earning at maturity and has no principal value.'}
      </p>
    </form>
  );
}
