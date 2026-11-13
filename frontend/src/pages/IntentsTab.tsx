import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { ActionButton, FormNotice, SummaryRow } from '../components/ProtocolUI';
import { Mark } from '../components/Brand';
import {
  POPULAR_TOKENS,
  fetchSupportedTokens,
  requestIntentsQuote,
} from '../lib/intents';
import { formatUnits, parseTokenUnits } from '../lib/formatters';
import type { OneClickQuote, OneClickToken } from '../types';

function chainLabel(chain: string) {
  return (
    (
      {
        eth: 'Ethereum',
        arb: 'Arbitrum',
        arbitrum: 'Arbitrum',
        base: 'Base',
        sol: 'Solana',
      } as Record<string, string>
    )[chain] || chain
  );
}

export function IntentsTab() {
  const [tokens, setTokens] = useState<OneClickToken[]>(POPULAR_TOKENS);
  const [token, setToken] = useState(POPULAR_TOKENS[0]);
  const [amount, setAmount] = useState('100');
  const [quote, setQuote] = useState<OneClickQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchSupportedTokens().then((data) => {
      if (active) {
        const supported = data.filter(
          (t) =>
            ['eth', 'arb', 'arbitrum', 'base', 'sol'].includes(t.blockchain) &&
            ['USDC', 'ETH', 'SOL', 'USDT'].includes(t.symbol),
        );
        const choices = [
          ...new Map(
            [...POPULAR_TOKENS, ...supported].map((t) => [t.assetId, t]),
          ).values(),
        ];
        setTokens(choices);
        setToken(
          (current) =>
            choices.find((t) => t.assetId === current.assetId) || current,
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);
  async function preview() {
    if (busy) return;
    setQuote(null);
    setError(null);
    try {
      const value = parseTokenUnits(amount, token.decimals);
      if (BigInt(value) <= 0n)
        throw new Error('Enter an amount greater than zero.');
      setBusy(true);
      const result = await requestIntentsQuote({
        dry: true,
        originAsset: token.assetId,
        amountBaseUnits: value,
        recipientAccountId: 'exodus.near',
      });
      setQuote(result.quote);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not fetch a route. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  const reset = () => {
    setQuote(null);
    setError(null);
  };
  return (
    <div className="intents-layout">
      <section className="intents-story">
        <span className="eyebrow">POWERED BY NEAR INTENTS</span>
        <h2>One route. Less friction.</h2>
        <p>
          Compare the estimated output, fees, and arrival time before moving
          between chains.
        </p>
        <div className="route-story">
          <div className="route-endpoint">
            <span className="route-chain-icon"><Globe size={20} /></span>
            <span><strong>{chainLabel(token.blockchain)}</strong><small>{token.symbol}</small></span>
          </div>
          <span className="route-connector"><ArrowRight size={16} /></span>
          <div className="route-endpoint">
            <span className="route-chain-icon"><Mark /></span>
            <span><strong>NEAR</strong><small>wNEAR</small></span>
          </div>
        </div>
        <div className="intent-step">
          <span>01</span>
          <div>
            <h3>Choose your asset</h3>
            <p>Select a token and its origin chain.</p>
          </div>
        </div>
        <div className="intent-step">
          <span>02</span>
          <div>
            <h3>Compare a live quote</h3>
            <p>Compare the estimated output, fees, and time.</p>
          </div>
        </div>
        <div className="intent-step">
          <span>03</span>
          <div>
            <h3>Preview with no commitment</h3>
            <p>
              Mainnet quotes are separate from Exodus testnet markets. No
              deposit address is generated here.
            </p>
          </div>
        </div>
        <a
          className="text-link"
          href="https://docs.near-intents.org/"
          target="_blank"
          rel="noreferrer"
        >
          Learn about NEAR Intents <ArrowUpRight size={14} />
        </a>
      </section>
      <form
        className="trade-panel"
        onSubmit={(e) => {
          e.preventDefault();
          void preview();
        }}
      >
        <div className="panel-heading">
          <span className="token-symbol pt-symbol">
            <Globe size={17} />
          </span>
          <div>
            <h2>Preview a route</h2>
            <p>Find your way to NEAR</p>
          </div>
          <span className="route-preview-badge">Preview only</span>
        </div>
        <fieldset className="intents-fields" disabled={busy}>
          <label htmlFor="origin-token" className="field-label">
            From token & chain
          </label>
          <select
            id="origin-token"
            value={token.assetId}
            onChange={(e) => {
              const selected = tokens.find((t) => t.assetId === e.target.value);
              if (selected) {
                setToken(selected);
                reset();
              }
            }}
          >
            {tokens.map((t) => (
              <option value={t.assetId} key={t.assetId}>
                {t.symbol} · {chainLabel(t.blockchain)}
              </option>
            ))}
          </select>
          <div className="intent-amount amount-field">
            <label className="field-label" htmlFor="intents-amount">You send</label>
            <div className="amount-input-row">
            <input
              id="intents-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                reset();
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="amount-token"><span className="mini-token">{token.symbol.slice(0, 1)}</span>{token.symbol}</span>
            </div>
          </div>
        </fieldset>
        <div className="swap-divider">
          <ArrowDown size={14} />
        </div>
        <div className="trade-output">
          <span>Estimated receive on NEAR</span>
          <div>
            <strong>
              {busy
                ? '…'
                : quote
                  ? Number(quote.amountOutFormatted).toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })
                  : '—'}
            </strong>
            <span className="amount-token"><span className="mini-token">N</span>wNEAR</span>
          </div>
        </div>
        <div className="trade-summary">
          <SummaryRow label="Estimated time">
            {quote ? `~${quote.timeEstimate}s` : '—'}
          </SummaryRow>
          <SummaryRow label="Minimum received">
            {quote ? `${formatUnits(quote.minAmountOut, 6)} wNEAR` : '—'}
          </SummaryRow>
          <SummaryRow label="Slippage tolerance">1.0%</SummaryRow>
        </div>
        {error && <FormNotice error>{error}</FormNotice>}
        <FormNotice>
          1Click quotes use mainnet assets. Exodus markets use testnet assets.
          This preview does not bridge funds or buy PT.
        </FormNotice>
        <ActionButton busy={busy}>
          {quote ? (
            <>
              Refresh quote <RefreshCw size={13} />
            </>
          ) : (
            'Preview route'
          )}
        </ActionButton>
        <p className="panel-footnote">
          No wallet connection. No funds moved. Quotes can expire.
        </p>
      </form>
    </div>
  );
}
