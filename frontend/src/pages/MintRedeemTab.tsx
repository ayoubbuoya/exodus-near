import { useState } from 'react';
import { ArrowRight, Split } from 'lucide-react';
import { GlassInstrument } from '../components/GlassInstrument';
import {
  ActionButton,
  AmountField,
  FormNotice,
  SummaryRow,
} from '../components/ProtocolUI';
import { useMarket } from '../context/MarketContext';
import { useWallet } from '../context/WalletContext';
import { useProtocolAction } from '../hooks/useProtocolAction';
import { formatIndex, formatUnits, safeAmount } from '../lib/formatters';
import { APP_CONFIG } from '../config';
import type { TxStatus } from '../types';

export function MintRedeemTab({
  onTxUpdate,
}: {
  onTxUpdate: (tx: TxStatus) => void;
}) {
  const {
    selectedMarket,
    marketData,
    userPosition,
    lstBalance,
    balancesReady,
    refresh,
  } = useMarket();
  const { isConnected, connect, executeTransaction } = useWallet();
  const { busy, run } = useProtocolAction(onTxUpdate);
  const [mode, setMode] = useState<'mint' | 'redeem_py' | 'redeem_pt'>('mint');
  const [amount, setAmount] = useState('');
  const input = safeAmount(amount);
  const pt = BigInt(userPosition?.pt_balance || '0');
  const yt = BigInt(userPosition?.yt_balance || '0');
  const balance =
    mode === 'mint'
      ? BigInt(lstBalance)
      : mode === 'redeem_py'
        ? pt < yt
          ? pt
          : yt
        : pt;
  const index = BigInt(
    (mode === 'redeem_pt'
      ? marketData?.index_at_maturity || marketData?.py_index
      : marketData?.py_index) || '0',
  );
  const expected =
    index > 0n
      ? mode === 'mint'
        ? (input * index) / 10n ** 18n
        : (input * 10n ** 18n) / index
      : null;
  const matured =
    Date.now() >= (marketData?.expiry_ns || selectedMarket.expiryNs) / 1e6;
  const blocked =
    mode === 'mint'
      ? !marketData || marketData.paused || matured
      : mode === 'redeem_pt' && !matured;
  const insufficient = balancesReady && input > balance;
  async function submit() {
    if (!isConnected) {
      await connect();
      return;
    }
    if (input <= 0n || insufficient || blocked) return;
    await run(mode === 'mint' ? 'Split LST' : 'Redeem tokens', async () => {
      const tx =
        mode === 'mint'
          ? await executeTransaction(
              selectedMarket.lstContractId,
              'ft_transfer_call',
              {
                receiver_id: selectedMarket.marketContractId,
                amount: input.toString(),
                msg: JSON.stringify({ action: 'mint_py' }),
              },
              '1',
              APP_CONFIG.gasUnits.swap,
            )
          : await executeTransaction(
              selectedMarket.marketContractId,
              mode,
              { amount: input.toString() },
              '1',
              APP_CONFIG.gasUnits.swap,
            );
      await refresh();
      return tx;
    });
  }
  return (
    <div className="tokenize-layout">
      <section className="tokenize-story">
        <span className="eyebrow">THE WHOLE, AND ITS PARTS</span>
        <h2>
          {mode === 'mint' ? (
            <>
              Make room for
              <br />
              <span className="muted">more possibilities.</span>
            </>
          ) : (
            <>
              Bring it
              <br />
              <span className="muted">back together.</span>
            </>
          )}
        </h2>
        <GlassInstrument progress={mode === 'mint' ? 1 : 0} />
        <div className="tokenize-explainer">
          <SummaryRow label="PT · Principal">
            1 NEAR of LST at maturity
          </SummaryRow>
          <SummaryRow label="YT · Yield">
            Staking rewards until maturity
          </SummaryRow>
        </div>
        <p>
          {mode === 'mint'
            ? 'The staking index determines how much PT and YT your LST creates. Both are minted in equal amounts.'
            : mode === 'redeem_py'
              ? 'Burn an equal amount of PT and YT to reclaim the underlying LST. Pausing does not block this exit.'
              : 'After maturity, redeem PT on its own. Your LST payout uses the maturity index.'}
        </p>
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
            <Split size={17} />
          </span>
          <div>
            <h2>
              {mode === 'mint'
                ? 'Separate the possibilities.'
                : 'Reclaim your LST.'}
            </h2>
            <p>
              {selectedMarket.symbol} · {selectedMarket.maturityFormatted}
            </p>
          </div>
        </div>
        <div className="segmented three-segments">
          {(['mint', 'redeem_py', 'redeem_pt'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={mode === value ? 'selected' : ''}
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setAmount('');
              }}
            >
              {value === 'mint'
                ? 'Mint'
                : value === 'redeem_py'
                  ? 'PT + YT'
                  : 'Matured PT'}
            </button>
          ))}
        </div>
        <AmountField
          label={
            mode === 'mint'
              ? 'Deposit LST'
              : mode === 'redeem_py'
                ? 'Equal PT + YT to redeem'
                : 'PT to redeem'
          }
          value={amount}
          onChange={setAmount}
          token={mode === 'mint' ? selectedMarket.symbol : 'PT'}
          balance={
            isConnected
              ? balancesReady
                ? formatUnits(balance, 6)
                : '—'
              : undefined
          }
          onMax={
            balancesReady
              ? () => setAmount(formatUnits(balance, 24))
              : undefined
          }
        />
        <div className="mint-output">
          <span className="eyebrow">ESTIMATED RECEIVE</span>
          {mode === 'mint' ? (
            <div className="mint-split-values">
              <span>
                <b>{expected === null ? '—' : formatUnits(expected, 6)}</b> PT
              </span>
              <span className="muted">+</span>
              <span className="yield-ink">
                <b>{expected === null ? '—' : formatUnits(expected, 6)}</b> YT
              </span>
            </div>
          ) : (
            <strong>
              {expected === null ? '—' : formatUnits(expected, 6)}{' '}
              <small>{selectedMarket.symbol}</small>
            </strong>
          )}
        </div>
        <div className="trade-summary">
          <SummaryRow
            label={mode === 'redeem_pt' ? 'Maturity index' : 'Staking index'}
          >
            {index > 0n ? formatIndex(index.toString()) : '—'} NEAR
          </SummaryRow>
          <SummaryRow label="Maturity">
            {selectedMarket.maturityFormatted}
          </SummaryRow>
          <SummaryRow label="Rounding">
            Down to the smallest token unit
          </SummaryRow>
        </div>
        {insufficient && (
          <FormNotice error>
            Insufficient{' '}
            {mode === 'mint'
              ? selectedMarket.symbol
              : mode === 'redeem_py'
                ? 'paired PT and YT'
                : 'PT'}{' '}
            balance.
          </FormNotice>
        )}
        {blocked && (
          <FormNotice>
            {mode === 'redeem_pt'
              ? 'PT-only redemption opens after maturity. You can redeem paired PT + YT now.'
              : 'Minting requires an active, unpaused market. Redemptions remain available.'}
          </FormNotice>
        )}
        <ActionButton
          busy={busy}
          disabled={
            isConnected &&
            (input <= 0n ||
              insufficient ||
              !!blocked ||
              (mode === 'mint' && !balancesReady))
          }
        >
          {!isConnected
            ? 'Connect wallet'
            : input <= 0n
              ? 'Enter an amount'
              : mode === 'mint'
                ? 'Mint PT + YT'
                : 'Redeem for LST'}
        </ActionButton>
        <p className="panel-footnote">
          You approve each transaction in your wallet.
        </p>
      </form>
      <a
        className="text-link tokenize-portfolio"
        href={`#/app/portfolio?market=${selectedMarket.id}`}
      >
        See your token balances <ArrowRight size={14} />
      </a>
    </div>
  );
}
