import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { useMarket } from '../context/MarketContext';
import { formatUnits, parseUnits } from '../lib/formatters';
import { APP_CONFIG } from '../config';
import type { TxStatus } from '../types';
import { Coins, Droplets, PlusCircle, MinusCircle, Info, AlertCircle, Plus } from 'lucide-react';

interface PoolTabProps {
  onTxUpdate: (tx: TxStatus) => void;
}

export const PoolTab: React.FC<PoolTabProps> = ({ onTxUpdate }) => {
  const { isConnected, connect, executeTransaction } = useWallet();
  const { selectedMarket, marketData, userPosition, lstBalance, refresh } = useMarket();

  const [activeAction, setActiveAction] = useState<'add' | 'remove'>('add');
  const [addSyInput, setAddSyInput] = useState<string>('50');
  const [addPtInput, setAddPtInput] = useState<string>('50');
  const [removeLpInput, setRemoveLpInput] = useState<string>('0');

  const totalPtFormatted = formatUnits(marketData?.total_pt, 2);
  const totalSyFormatted = formatUnits(marketData?.total_sy, 2);
  const userLpFormatted = formatUnits(userPosition?.lp_balance, 4);
  const userPtFormatted = formatUnits(userPosition?.pt_balance, 4);
  const userLstFormatted = formatUnits(lstBalance, 4);

  const totalPtBig = marketData?.total_pt ? BigInt(marketData.total_pt) : 0n;
  const totalSyBig = marketData?.total_sy ? BigInt(marketData.total_sy) : 0n;
  const totalLpBig = marketData?.total_lp ? BigInt(marketData.total_lp) : 0n;
  const hasPoolReserves = totalPtBig > 0n && totalSyBig > 0n;

  // Pool ratio: PT per 1 SY
  const poolRatio = hasPoolReserves ? Number(totalPtBig) / Number(totalSyBig) : 1.0;

  // Handle bi-directional input sync based on current pool ratio
  const handleSyChange = (val: string) => {
    setAddSyInput(val);
    if (!val || isNaN(parseFloat(val))) {
      setAddPtInput('');
      return;
    }
    if (hasPoolReserves && poolRatio > 0) {
      const calculatedPt = (parseFloat(val) * poolRatio).toFixed(4);
      setAddPtInput(calculatedPt);
    }
  };

  const handlePtChange = (val: string) => {
    setAddPtInput(val);
    if (!val || isNaN(parseFloat(val))) {
      setAddSyInput('');
      return;
    }
    if (hasPoolReserves && poolRatio > 0) {
      const calculatedSy = (parseFloat(val) / poolRatio).toFixed(4);
      setAddSyInput(calculatedSy);
    }
  };

  const handleMaxSy = () => {
    handleSyChange(userLstFormatted);
  };

  const handleMaxPt = () => {
    handlePtChange(userPtFormatted);
  };

  // Expected LP tokens minted
  const expectedLpMinted = (() => {
    try {
      const syYocto = BigInt(parseUnits(addSyInput));
      const ptYocto = BigInt(parseUnits(addPtInput));
      if (syYocto <= 0n || ptYocto <= 0n) return '0.0000';

      if (!hasPoolReserves || totalLpBig <= 0n) {
        // Initial deposit: sqrt(PT * SY)
        const syNum = Number(syYocto) / 1e24;
        const ptNum = Number(ptYocto) / 1e24;
        return Math.sqrt(syNum * ptNum).toFixed(4);
      }

      // Proportional deposit: (sy_in * total_lp) / total_sy
      const lpNum = (Number(syYocto) * Number(totalLpBig)) / Number(totalSyBig) / 1e24;
      return lpNum.toFixed(4);
    } catch {
      return '0.0000';
    }
  })();

  // User share percentage of pool
  const userSharePercent = (() => {
    try {
      if (!userPosition?.lp_balance || !marketData?.total_lp || marketData.total_lp === '0') return '0.00%';
      const user = Number(BigInt(userPosition.lp_balance)) / 1e24;
      const total = Number(BigInt(marketData.total_lp)) / 1e24;
      if (total <= 0) return '0.00%';
      return `${((user / total) * 100).toFixed(2)}%`;
    } catch {
      return '0.00%';
    }
  })();

  // Balance validations
  const userLstYocto = BigInt(lstBalance || '0');
  const userPtYocto = BigInt(userPosition?.pt_balance || '0');
  const syInYocto = BigInt(parseUnits(addSyInput));
  const ptInYocto = BigInt(parseUnits(addPtInput));

  const hasInsufficientLst = isConnected && syInYocto > userLstYocto;
  const hasInsufficientPt = isConnected && ptInYocto > userPtYocto;
  const isAddInvalid =
    parseFloat(addSyInput || '0') <= 0 ||
    parseFloat(addPtInput || '0') <= 0 ||
    hasInsufficientLst ||
    hasInsufficientPt;

  const handleAddLiquidity = async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    try {
      const syInYoctoStr = parseUnits(addSyInput);
      const ptDesiredYoctoStr = parseUnits(addPtInput);

      onTxUpdate({
        status: 'pending',
        title: 'Adding Liquidity',
        message: `Depositing ${addSyInput} ${selectedMarket.symbol} + ${addPtInput} PT to mint LP shares...`,
      });

      const msg = JSON.stringify({
        action: 'add_liquidity',
        pt_desired: ptDesiredYoctoStr,
        min_lp_out: '0',
      });

      const tx = await executeTransaction(
        selectedMarket.lstContractId,
        'ft_transfer_call',
        {
          receiver_id: selectedMarket.marketContractId,
          amount: syInYoctoStr,
          msg,
        },
        '1',
        APP_CONFIG.gasUnits.swap
      );

      onTxUpdate({
        status: 'success',
        title: 'Liquidity Added',
        message: `Successfully supplied ${addSyInput} ${selectedMarket.symbol} and ${addPtInput} PT to the pool.`,
        txHash: tx?.transaction?.hash,
      });

      await refresh();
    } catch (err: any) {
      console.error('Add liquidity error:', err);
      onTxUpdate({
        status: 'error',
        title: 'Add Liquidity Failed',
        message: err?.message || 'Transaction failed.',
      });
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    try {
      const lpInYocto = parseUnits(removeLpInput);

      onTxUpdate({
        status: 'pending',
        title: 'Removing Liquidity',
        message: 'Burning LP tokens to redeem pro-rata PT and LST...',
      });

      const tx = await executeTransaction(
        selectedMarket.marketContractId,
        'remove_liquidity',
        {
          lp: lpInYocto,
          min_pt_out: '0',
          min_sy_out: '0',
        },
        '1',
        APP_CONFIG.gasUnits.swap
      );

      onTxUpdate({
        status: 'success',
        title: 'Liquidity Removed',
        message: `Successfully burned ${removeLpInput} LP tokens and reclaimed reserves.`,
        txHash: tx?.transaction?.hash,
      });

      await refresh();
    } catch (err: any) {
      console.error('Remove liquidity error:', err);
      onTxUpdate({
        status: 'error',
        title: 'Remove Liquidity Failed',
        message: err?.message || 'Transaction failed.',
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Pool Header Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <Coins className="w-4 h-4 text-cyan-400" />
            <span>Pool PT Reserves</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">{totalPtFormatted} PT</div>
          <p className="text-xs text-slate-400 mt-1">Principal token liquidity</p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <Droplets className="w-4 h-4 text-emerald-400" />
            <span>Pool SY Reserves</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {totalSyFormatted} {selectedMarket.symbol}
          </div>
          <p className="text-xs text-slate-400 mt-1">Underlying staking asset</p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <Info className="w-4 h-4 text-purple-400" />
            <span>Your Pool Share</span>
          </div>
          <div className="text-2xl font-bold font-mono text-purple-400">{userSharePercent}</div>
          <p className="text-xs text-slate-400 mt-1">Holding {userLpFormatted} LP</p>
        </div>
      </div>

      {/* Main Interaction Card */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-800">
        {/* Toggle Add / Remove Liquidity */}
        <div className="flex p-1 bg-slate-900/90 rounded-2xl mb-6 border border-slate-800 max-w-md mx-auto">
          <button
            onClick={() => setActiveAction('add')}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center space-x-1.5 transition-all ${
              activeAction === 'add'
                ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Liquidity</span>
          </button>
          <button
            onClick={() => setActiveAction('remove')}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center space-x-1.5 transition-all ${
              activeAction === 'remove'
                ? 'bg-slate-800 text-slate-100 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MinusCircle className="w-4 h-4" />
            <span>Remove Liquidity</span>
          </button>
        </div>

        {activeAction === 'add' ? (
          <div className="max-w-lg mx-auto space-y-5">
            {/* Input 1: Supply LST */}
            <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-2">
                <span>Supply LST (Underlying)</span>
                <span className="flex items-center space-x-1">
                  <span>Balance:</span>
                  <span className="text-slate-200 font-mono">{userLstFormatted}</span>
                  <button
                    onClick={handleMaxSy}
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
                  value={addSyInput}
                  onChange={(e) => handleSyChange(e.target.value)}
                  className="bg-transparent text-2xl font-mono font-bold text-white focus:outline-none w-2/3"
                />
                <span className="font-bold text-sm bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
                  {selectedMarket.symbol}
                </span>
              </div>
            </div>

            {/* Plus Divider */}
            <div className="flex items-center justify-center -my-2">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shadow-lg">
                <Plus className="w-4 h-4" />
              </div>
            </div>

            {/* Input 2: Supply PT */}
            <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-2">
                <span>Supply PT (Principal Token)</span>
                <span className="flex items-center space-x-1">
                  <span>Balance:</span>
                  <span className="text-slate-200 font-mono">{userPtFormatted}</span>
                  <button
                    onClick={handleMaxPt}
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
                  value={addPtInput}
                  onChange={(e) => handlePtChange(e.target.value)}
                  className="bg-transparent text-2xl font-mono font-bold text-white focus:outline-none w-2/3"
                />
                <span className="font-bold text-sm bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-cyan-400">
                  PT
                </span>
              </div>
            </div>

            {/* Deposit Breakdown */}
            <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 text-xs space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>Pool Price Ratio:</span>
                <span className="font-mono text-slate-200 font-semibold">
                  1 {selectedMarket.symbol} = {poolRatio.toFixed(4)} PT
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Expected LP Received:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {expectedLpMinted} LP
                </span>
              </div>
            </div>

            {/* Warning if insufficient PT */}
            {hasInsufficientPt && (
              <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-600/40 text-xs text-amber-200 flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">Insufficient PT Balance</p>
                  <p className="text-slate-400 leading-relaxed">
                    You need <span className="text-amber-200 font-mono">{addPtInput} PT</span> to pair with your {selectedMarket.symbol}. You can mint PT+YT in the <span className="text-cyan-300 font-medium">Mint / Redeem</span> tab or purchase PT in the <span className="text-cyan-300 font-medium">Fix Yield</span> tab.
                  </p>
                </div>
              </div>
            )}

            {/* Warning if insufficient LST */}
            {hasInsufficientLst && (
              <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-600/40 text-xs text-amber-200 flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">Insufficient {selectedMarket.symbol} Balance</p>
                  <p className="text-slate-400 leading-relaxed">
                    You only have <span className="text-amber-200 font-mono">{userLstFormatted} {selectedMarket.symbol}</span>.
                  </p>
                </div>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-800/30 text-xs text-cyan-200 space-y-1">
              <p className="font-semibold text-cyan-300">Why provide dual-token liquidity on Exodus?</p>
              <p className="text-slate-400 leading-relaxed">
                Exodus AMM uses a zero-impermanent-loss converging logit curve. Supplying proportional PT + LST preserves pool price balance with zero price impact while earning continuous swap fees.
              </p>
            </div>

            <button
              onClick={handleAddLiquidity}
              disabled={isAddInvalid}
              className="w-full py-4 rounded-2xl font-extrabold text-base bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 shadow-xl shadow-cyan-500/20 transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              {!isConnected
                ? 'Connect Wallet'
                : hasInsufficientPt
                ? 'Insufficient PT Balance'
                : hasInsufficientLst
                ? `Insufficient ${selectedMarket.symbol} Balance`
                : `Deposit Liquidity & Mint LP`}
            </button>
          </div>
        ) : (
          <div className="max-w-lg mx-auto space-y-5">
            <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-2">
                <span>Burn LP Tokens</span>
                <span className="flex items-center space-x-1">
                  <span>Balance:</span>
                  <span className="text-slate-200 font-mono">{userLpFormatted} LP</span>
                  <button
                    onClick={() => setRemoveLpInput(formatUnits(userPosition?.lp_balance, 4))}
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
                  value={removeLpInput}
                  onChange={(e) => setRemoveLpInput(e.target.value)}
                  className="bg-transparent text-2xl font-mono font-bold text-white focus:outline-none w-2/3"
                />
                <span className="font-bold text-sm bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
                  LP Tokens
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed text-center">
              Burning LP tokens releases your proportional share of both pool PT and LST reserves back to your account.
            </p>

            <button
              onClick={handleRemoveLiquidity}
              disabled={parseFloat(removeLpInput) <= 0}
              className="w-full py-4 rounded-2xl font-extrabold text-base bg-slate-800 hover:bg-slate-700 text-slate-100 transition disabled:opacity-40"
            >
              {!isConnected ? 'Connect Wallet' : 'Burn LP & Reclaim Assets'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
