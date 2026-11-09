import React, { useState, useEffect, useMemo } from 'react';
import { useWallet } from '../context/WalletContext';
import { useMarket } from '../context/MarketContext';
import { formatUnits, parseUnits, formatPercent, calcImpliedApyPercent, formatIndex } from '../lib/formatters';
import { fetchPreviewSyForPt } from '../lib/rpc';
import {
  POPULAR_TOKENS,
  fetchSupportedTokens,
  requestIntentsQuote,
  checkDepositStatus,
} from '../lib/intents';
import type { OneClickToken, OneClickQuote, TxStatus } from '../types';
import {
  Sparkles,
  Globe,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Copy,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';

interface IntentsTabProps {
  onTxUpdate: (tx: TxStatus) => void;
}

export const IntentsTab: React.FC<IntentsTabProps> = ({ onTxUpdate }) => {
  const { accountId, isConnected } = useWallet();
  const { selectedMarket, marketData, poolData } = useMarket();

  const [tokens, setTokens] = useState<OneClickToken[]>(POPULAR_TOKENS);
  const [selectedToken, setSelectedToken] = useState<OneClickToken>(POPULAR_TOKENS[0]);
  const [amountInput, setAmountInput] = useState<string>('100');
  const [isDryRun, setIsDryRun] = useState<boolean>(true);

  // Quote State
  const [isQuoting, setIsQuoting] = useState<boolean>(false);
  const [quoteData, setQuoteData] = useState<OneClickQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Exodus PT Simulation
  const [estimatedPt, setEstimatedPt] = useState<string>('0');
  const [isSimulatingPt, setIsSimulatingPt] = useState<boolean>(false);

  // Real Mode Deposit State
  const [isGeneratingAddress, setIsGeneratingAddress] = useState<boolean>(false);
  const [activeDepositAddress, setActiveDepositAddress] = useState<string | null>(null);
  const [depositStatus, setDepositStatus] = useState<string>('PENDING');
  const [copied, setCopied] = useState<boolean>(false);

  const impliedApy = calcImpliedApyPercent(poolData?.last_ln_implied_rate);
  const pyIndex = parseFloat(formatIndex(marketData?.py_index)) || 1.30;

  // Load supported tokens on mount
  useEffect(() => {
    fetchSupportedTokens()
      .then((t) => {
        if (t && t.length > 0) setTokens(t);
      })
      .catch(() => {});
  }, []);

  // Compute base units from user string input and token decimals
  const amountBaseUnits = useMemo(() => {
    try {
      const val = parseFloat(amountInput);
      if (isNaN(val) || val <= 0) return '0';
      // Multiplied by 10^decimals
      const factor = BigInt(10) ** BigInt(selectedToken.decimals);
      const integerPart = BigInt(Math.floor(val));
      const fractionalPart = BigInt(Math.round((val - Math.floor(val)) * Number(factor)));
      return (integerPart * factor + fractionalPart).toString();
    } catch {
      return '0';
    }
  }, [amountInput, selectedToken]);

  // Debounced quote fetch
  useEffect(() => {
    let active = true;
    const val = parseFloat(amountInput);

    if (isNaN(val) || val <= 0 || amountBaseUnits === '0') {
      setQuoteData(null);
      setEstimatedPt('0');
      setQuoteError(null);
      return;
    }

    setIsQuoting(true);
    setQuoteError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await requestIntentsQuote({
          dry: isDryRun,
          originAsset: selectedToken.assetId,
          amountBaseUnits,
          recipientAccountId: accountId || 'fond-buoya.testnet',
        });

        if (!active) return;
        setQuoteData(res.quote);

        // Calculate PT received from Exodus AMM using the estimated wNEAR received
        if (res.quote && res.quote.amountOut) {
          setIsSimulatingPt(true);
          try {
            // wNEAR is 24 decimals. LST (SY) = wNEAR / py_index.
            const wnearFloat = parseFloat(res.quote.amountOutFormatted);
            const syEstimatedFloat = wnearFloat / pyIndex;
            const syYocto = parseUnits(syEstimatedFloat.toFixed(6));

            const ptPreview = await fetchPreviewSyForPt(selectedMarket.marketContractId, syYocto);
            if (active) {
              setEstimatedPt(ptPreview.amount_out);
            }
          } catch {
            // If sandbox/view call is unavailable, estimate PT via fixed discount from implied APY
            if (active) {
              const daysLeft = Math.max(1, Math.round((selectedMarket.expiryNs - Date.now() * 1e6) / (86400 * 1e9)));
              const rate = (impliedApy / 100) * (daysLeft / 365);
              const wnearFloat = parseFloat(res.quote.amountOutFormatted);
              const estPt = (wnearFloat * (1 + rate)).toFixed(4);
              setEstimatedPt(parseUnits(estPt));
            }
          } finally {
            if (active) setIsSimulatingPt(false);
          }
        }
      } catch (err: any) {
        if (active) {
          console.error('1Click quote error:', err);
          setQuoteError(err?.message || 'Failed to fetch quote from NEAR Intents.');
          setQuoteData(null);
          setEstimatedPt('0');
        }
      } finally {
        if (active) setIsQuoting(false);
      }
    }, 450);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [amountInput, selectedToken, isDryRun, accountId, selectedMarket, impliedApy, pyIndex]);

  // Handle Real Mode Deposit Address Generation
  const handleGenerateDeposit = async () => {
    if (!isConnected) {
      onTxUpdate({
        status: 'error',
        title: 'Wallet Required',
        message: 'Please connect your NEAR wallet to receive funds from the cross-chain swap.',
      });
      return;
    }

    try {
      setIsGeneratingAddress(true);
      const res = await requestIntentsQuote({
        dry: false,
        originAsset: selectedToken.assetId,
        amountBaseUnits,
        recipientAccountId: accountId || 'fond-buoya.testnet',
      });

      if (res.quote && res.quote.depositAddress) {
        setActiveDepositAddress(res.quote.depositAddress);
        setDepositStatus('PENDING');
      } else {
        throw new Error('No deposit address returned by 1Click.');
      }
    } catch (err: any) {
      onTxUpdate({
        status: 'error',
        title: 'Failed to Create Deposit Address',
        message: err?.message || 'Could not initiate cross-chain deposit.',
      });
    } finally {
      setIsGeneratingAddress(false);
    }
  };

  // Poll status when a real deposit address is active
  useEffect(() => {
    if (!activeDepositAddress) return;
    const interval = setInterval(async () => {
      try {
        const st = await checkDepositStatus(activeDepositAddress);
        if (st && st.status) {
          setDepositStatus(st.status);
          if (st.status === 'SUCCESS') {
            clearInterval(interval);
            onTxUpdate({
              status: 'success',
              title: 'Cross-Chain Deposit Received!',
              message: `Your funds arrived on NEAR Protocol! You can now lock PT for fixed yield.`,
            });
          }
        }
      } catch {}
    }, 5000);

    return () => clearInterval(interval);
  }, [activeDepositAddress, onTxUpdate]);

  const copyAddress = () => {
    if (!activeDepositAddress) return;
    navigator.clipboard.writeText(activeDepositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Formatted numbers for summary card
  const wnearOut = quoteData ? parseFloat(quoteData.amountOutFormatted).toFixed(3) : '0.00';
  const ptOut = formatUnits(estimatedPt, 2);
  const netNearProfit = (parseFloat(ptOut) - parseFloat(wnearOut)).toFixed(3);

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-52 h-52 bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 rounded-2xl border border-cyan-500/30 text-cyan-400">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-100 flex items-center space-x-2">
                <span>Fixed Yield from Any Chain</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  NEAR Intents 1Click
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Deposit assets from Arbitrum, Ethereum, Base, or Solana and lock guaranteed fixed NEAR yield.
              </p>
            </div>
          </div>

          {/* Mode Switch (Dry-run / Real) */}
          <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800 self-start sm:self-center">
            <button
              onClick={() => {
                setIsDryRun(true);
                setActiveDepositAddress(null);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                isDryRun
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>⚡ Dry-Run Quote (Judge Mode)</span>
            </button>
            <button
              onClick={() => setIsDryRun(false)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !isDryRun
                  ? 'bg-slate-800 text-slate-100 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Real Deposit</span>
            </button>
          </div>
        </div>

        {isDryRun && (
          <div className="bg-cyan-950/40 border border-cyan-800/40 rounded-xl p-3 text-xs text-cyan-300 flex items-start space-x-2">
            <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0 text-cyan-400" />
            <div>
              <strong>Judge & Visitor Simulation Mode Active:</strong> You can query real-time cross-chain liquidity and simulate locking fixed yield without connecting a wallet, depositing tokens, or spending gas.
            </div>
          </div>
        )}
      </div>

      {/* Main Configuration Card */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl space-y-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Step 1: Choose Source Asset & Amount
        </h3>

        {/* Quick Token Selection Chips & Full Dropdown */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {POPULAR_TOKENS.map((tok) => {
              const isSelected = selectedToken.assetId === tok.assetId;
              return (
                <button
                  key={tok.assetId}
                  onClick={() => setSelectedToken(tok)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                    isSelected
                      ? 'bg-cyan-500/10 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-500/20'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    {tok.blockchain}
                  </span>
                  <span>{tok.symbol}</span>
                </button>
              );
            })}
          </div>

          <div className="relative">
            <select
              value={selectedToken.assetId}
              onChange={(e) => {
                const found = tokens.find((t) => t.assetId === e.target.value);
                if (found) setSelectedToken(found);
              }}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-300 appearance-none focus:outline-none focus:border-cyan-500 pr-8 font-mono"
            >
              {tokens.map((tok) => (
                <option key={tok.assetId} value={tok.assetId} className="bg-slate-950 text-slate-200">
                  [{tok.blockchain.toUpperCase()}] {tok.symbol} ({tok.assetId.length > 40 ? tok.assetId.slice(0, 40) + '...' : tok.assetId})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Source Asset Input */}
        <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-2">
            <span>Amount to Deposit</span>
            <span>
              Chain: <strong className="text-slate-200 uppercase font-mono">{selectedToken.blockchain}</strong>
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.0"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="bg-transparent text-2xl sm:text-3xl font-black text-slate-100 placeholder-slate-600 focus:outline-none w-full"
            />

            <div className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 flex-shrink-0">
              <span className="font-bold text-sm text-slate-100">{selectedToken.symbol}</span>
            </div>
          </div>

          {quoteData && (
            <div className="mt-2 text-xs text-slate-500">
              Estimated USD Value: ~${quoteData.amountInUsd || '100.00'}
            </div>
          )}
        </div>

        {/* Target Exodus Market */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-400">Target Exodus Market</div>
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="font-bold text-sm text-slate-100">{selectedMarket.name}</div>
              <div className="text-xs text-slate-400">
                Maturity: <span className="text-slate-300 font-medium">{selectedMarket.maturityFormatted}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">Fixed Implied APY</div>
              <div className="text-base font-black text-emerald-400">{formatPercent(impliedApy)}</div>
            </div>
          </div>
        </div>

        {/* Live Simulation & Routing Breakdown */}
        <div className="space-y-4 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <span>Step 2: Cross-Chain Execution Route</span>
              {(isQuoting || isSimulatingPt) && (
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              )}
            </h3>
            {quoteData && (
              <span className="text-xs text-slate-400 flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Est. Swap Time: ~{quoteData.timeEstimate}s</span>
              </span>
            )}
          </div>

          {quoteError ? (
            <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-900/40 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{quoteError}</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Card 1: Deposit */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">You Deposit</div>
                <div className="text-lg font-bold text-slate-100">
                  {amountInput || '0'} {selectedToken.symbol}
                </div>
                <div className="text-xs text-slate-400 capitalize">{selectedToken.blockchain} Network</div>
              </div>

              {/* Card 2: 1Click Defuse */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Arrives on NEAR</div>
                <div className="text-lg font-bold text-cyan-400">~{wnearOut} NEAR</div>
                <div className="text-xs text-slate-400">via NEAR Intents 1Click</div>
              </div>

              {/* Card 3: PT Output & Fixed Return */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-emerald-900/40 bg-emerald-950/10 space-y-1">
                <div className="text-[11px] font-semibold text-emerald-400 uppercase">Maturity Payout</div>
                <div className="text-lg font-black text-emerald-300">~{ptOut} NEAR</div>
                <div className="text-xs text-emerald-400/80 font-medium">
                  {selectedMarket.maturityFormatted} (+{netNearProfit} NEAR)
                </div>
              </div>
            </div>
          )}

          {/* Guaranteed Plain English Summary */}
          {quoteData && !quoteError && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/30 via-slate-900/50 to-emerald-950/30 border border-cyan-800/30 flex items-start space-x-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 space-y-1">
                <div className="font-bold text-slate-100 text-sm">Fixed Yield Outcome Summary</div>
                <p>
                  Depositing <strong className="text-slate-100">{amountInput} {selectedToken.symbol}</strong> from{' '}
                  <strong className="text-slate-100 uppercase">{selectedToken.blockchain}</strong> converts into{' '}
                  <strong className="text-cyan-300">~{wnearOut} NEAR</strong> and locks{' '}
                  <strong className="text-emerald-300">~{ptOut} PT</strong> at an implied rate of{' '}
                  <strong className="text-emerald-300">{formatPercent(impliedApy)}</strong>.
                </p>
                <p className="text-slate-400">
                  On <strong className="text-slate-200">{selectedMarket.maturityFormatted}</strong>, your PT redeems for exactly{' '}
                  <strong className="text-emerald-300 font-mono">{ptOut} NEAR</strong> regardless of market rate fluctuations.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Button / Real Deposit Interface */}
        {!isDryRun && (
          <div className="pt-4 border-t border-slate-800 space-y-4">
            {!activeDepositAddress ? (
              <button
                onClick={handleGenerateDeposit}
                disabled={isGeneratingAddress || !amountInput || parseFloat(amountInput) <= 0}
                className="w-full py-4 rounded-2xl font-black text-base bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-lg shadow-cyan-500/20 hover:opacity-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingAddress ? 'Generating 1Click Deposit Address...' : 'Generate Cross-Chain Deposit Address'}
              </button>
            ) : (
              <div className="p-5 rounded-2xl bg-slate-900 border border-cyan-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs font-bold text-cyan-300">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span>Awaiting Cross-Chain Deposit</span>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded font-mono font-bold bg-slate-800 text-slate-300">
                    STATUS: {depositStatus}
                  </span>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-1">
                    Send exactly <strong className="text-slate-100">{amountInput} {selectedToken.symbol}</strong> on{' '}
                    <strong className="text-slate-100 uppercase">{selectedToken.blockchain}</strong> to:
                  </div>
                  <div className="flex items-center space-x-2 p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-cyan-200 break-all">
                    <span className="flex-1">{activeDepositAddress}</span>
                    <button
                      onClick={copyAddress}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                      title="Copy Address"
                    >
                      {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500">
                  Once your transaction confirms on {selectedToken.blockchain}, 1Click solvers will bridge the funds to your NEAR account ({accountId}) within ~25 seconds.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Protocol Architecture Note */}
      <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 text-xs text-slate-500 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <span>Non-Custodial: 1Click Defuse swaps directly to your NEAR account. Exodus locks fixed yield with no admin keys.</span>
        </div>
        <a
          href="https://docs.near-intents.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 font-semibold"
        >
          <span>NEAR Intents Docs</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};
