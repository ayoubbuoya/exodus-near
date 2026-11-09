import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { useMarket } from '../context/MarketContext';
import { formatUnits, parseUnits, formatIndex } from '../lib/formatters';
import { APP_CONFIG } from '../config';
import type { TxStatus } from '../types';
import { Split, Merge, CheckCircle, ShieldCheck } from 'lucide-react';

interface MintRedeemTabProps {
  onTxUpdate: (tx: TxStatus) => void;
}

export const MintRedeemTab: React.FC<MintRedeemTabProps> = ({ onTxUpdate }) => {
  const { isConnected, connect, executeTransaction } = useWallet();
  const { selectedMarket, marketData, userPosition, lstBalance, refresh } = useMarket();

  const [mode, setMode] = useState<'mint' | 'redeem_py' | 'redeem_pt'>('mint');
  const [amountInput, setAmountInput] = useState<string>('10');

  const pyIndexNum = marketData?.py_index
    ? Number(BigInt(marketData.py_index)) / 1e18
    : 1.0;
  const pyIndexFormatted = formatIndex(marketData?.py_index);

  // Calculate expected mint output: PT & YT = LST * py_index
  const expectedMintTokens = (() => {
    const amt = parseFloat(amountInput);
    if (isNaN(amt) || amt <= 0) return '0.00';
    return (amt * pyIndexNum).toFixed(4);
  })();

  // Calculate expected redeem output: LST = PT / py_index
  const expectedRedeemLST = (() => {
    const amt = parseFloat(amountInput);
    if (isNaN(amt) || amt <= 0 || pyIndexNum <= 0) return '0.00';
    return (amt / pyIndexNum).toFixed(4);
  })();

  const handleMax = () => {
    if (mode === 'mint') {
      setAmountInput(formatUnits(lstBalance, 4));
    } else if (mode === 'redeem_py') {
      // Min of PT and YT balance
      const pt = BigInt(userPosition?.pt_balance || '0');
      const yt = BigInt(userPosition?.yt_balance || '0');
      const min = pt < yt ? pt : yt;
      setAmountInput(formatUnits(min.toString(), 4));
    } else {
      setAmountInput(formatUnits(userPosition?.pt_balance, 4));
    }
  };

  const handleAction = async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    try {
      const yoctoIn = parseUnits(amountInput);

      if (mode === 'mint') {
        onTxUpdate({
          status: 'pending',
          title: 'Tokenizing LST',
          message: `Splitting ${amountInput} ${selectedMarket.symbol} into equal PT and YT tokens...`,
        });

        const msg = JSON.stringify({ action: 'mint_py' });

        const tx = await executeTransaction(
          selectedMarket.lstContractId,
          'ft_transfer_call',
          {
            receiver_id: selectedMarket.marketContractId,
            amount: yoctoIn,
            msg,
          },
          '1',
          APP_CONFIG.gasUnits.swap
        );

        onTxUpdate({
          status: 'success',
          title: 'Mint Complete',
          message: `Successfully minted ${expectedMintTokens} PT + ${expectedMintTokens} YT.`,
          txHash: tx?.transaction?.hash,
        });
      } else if (mode === 'redeem_py') {
        onTxUpdate({
          status: 'pending',
          title: 'Redeeming PT + YT',
          message: `Burning equal PT + YT to reclaim ${selectedMarket.symbol}...`,
        });

        const tx = await executeTransaction(
          selectedMarket.marketContractId,
          'redeem_py',
          { amount: yoctoIn },
          '1',
          APP_CONFIG.gasUnits.swap
        );

        onTxUpdate({
          status: 'success',
          title: 'Redeem Complete',
          message: `Successfully redeemed ${amountInput} PT + YT for ${expectedRedeemLST} ${selectedMarket.symbol}.`,
          txHash: tx?.transaction?.hash,
        });
      } else {
        // Redeem matured PT post-expiry
        onTxUpdate({
          status: 'pending',
          title: 'Redeeming Matured PT',
          message: `Redeeming PT at final maturity rate...`,
        });

        const tx = await executeTransaction(
          selectedMarket.marketContractId,
          'redeem_pt',
          { amount: yoctoIn },
          '1',
          APP_CONFIG.gasUnits.swap
        );

        onTxUpdate({
          status: 'success',
          title: 'Matured PT Redeemed',
          message: `Successfully redeemed ${amountInput} PT for ${selectedMarket.symbol}.`,
          txHash: tx?.transaction?.hash,
        });
      }

      await refresh();
    } catch (err: any) {
      console.error('Mint/Redeem error:', err);
      onTxUpdate({
        status: 'error',
        title: 'Action Failed',
        message: err?.message || 'Transaction could not be completed.',
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-800">
        {/* Sub-mode switcher */}
        <div className="flex p-1 bg-slate-900/90 rounded-2xl mb-6 border border-slate-800">
          <button
            onClick={() => setMode('mint')}
            className={`flex-1 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center space-x-1.5 transition-all ${
              mode === 'mint'
                ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Split className="w-3.5 h-3.5" />
            <span>Mint (Split LST)</span>
          </button>
          <button
            onClick={() => setMode('redeem_py')}
            className={`flex-1 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center space-x-1.5 transition-all ${
              mode === 'redeem_py'
                ? 'bg-slate-800 text-slate-100 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Merge className="w-3.5 h-3.5" />
            <span>Redeem (PT + YT)</span>
          </button>
          <button
            onClick={() => setMode('redeem_pt')}
            className={`flex-1 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center space-x-1.5 transition-all ${
              mode === 'redeem_pt'
                ? 'bg-slate-800 text-slate-100 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Redeem PT (Matured)</span>
          </button>
        </div>

        {/* Input Card */}
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800 mb-6">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-2">
            <span>
              {mode === 'mint'
                ? 'Deposit LST'
                : mode === 'redeem_py'
                ? 'Equal Amount of PT & YT to Burn'
                : 'Matured PT to Redeem'}
            </span>
            <span className="flex items-center space-x-1">
              <span>Available:</span>
              <span className="text-slate-200 font-mono">
                {mode === 'mint'
                  ? formatUnits(lstBalance, 4)
                  : mode === 'redeem_py'
                  ? `${formatUnits(userPosition?.pt_balance, 2)} PT / ${formatUnits(userPosition?.yt_balance, 2)} YT`
                  : `${formatUnits(userPosition?.pt_balance, 2)} PT`}
              </span>
              <button
                onClick={handleMax}
                className="text-cyan-400 hover:text-cyan-300 ml-1 font-bold underline"
              >
                MAX
              </button>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.0"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="bg-transparent text-2xl sm:text-3xl font-mono font-bold text-white focus:outline-none w-2/3"
            />
            <span className="font-bold text-sm bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
              {mode === 'mint' ? selectedMarket.symbol : 'PT'}
            </span>
          </div>
        </div>

        {/* Visual Token Breakdown */}
        {mode === 'mint' ? (
          <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-800/30 mb-6 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Tokenization Rate (py_index)</span>
              <span className="font-mono text-cyan-300 font-bold">{pyIndexFormatted} NEAR</span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-xs text-slate-400 font-semibold block">You Receive PT:</span>
                <span className="text-lg font-mono font-bold text-cyan-400">{expectedMintTokens} PT</span>
                <span className="text-[11px] text-slate-500 block">Redeems for principal</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-xs text-slate-400 font-semibold block">You Receive YT:</span>
                <span className="text-lg font-mono font-bold text-emerald-400">{expectedMintTokens} YT</span>
                <span className="text-[11px] text-slate-500 block">Collects staking yield</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 mb-6 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-semibold block">Expected LST Payout:</span>
              <span className="text-2xl font-mono font-bold text-emerald-400">
                {expectedRedeemLST} {selectedMarket.symbol}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleAction}
          disabled={parseFloat(amountInput) <= 0}
          className="w-full py-4 rounded-2xl font-extrabold text-base bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 shadow-xl shadow-cyan-500/20 active:scale-[0.98] transition disabled:opacity-40"
        >
          {!isConnected
            ? 'Connect Wallet'
            : mode === 'mint'
            ? `Mint ${expectedMintTokens} PT + YT`
            : mode === 'redeem_py'
            ? `Redeem for ${expectedRedeemLST} ${selectedMarket.symbol}`
            : 'Redeem Matured PT'}
        </button>
      </div>
    </div>
  );
};
