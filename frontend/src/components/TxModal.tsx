import React from 'react';
import type { TxStatus } from '../types';
import { APP_CONFIG } from '../config';
import { Loader2, CheckCircle2, AlertTriangle, ExternalLink, X } from 'lucide-react';

interface TxModalProps {
  tx: TxStatus;
  onClose: () => void;
}

export const TxModal: React.FC<TxModalProps> = ({ tx, onClose }) => {
  if (tx.status === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-slate-700/80 relative text-center">
        {/* Close Button */}
        {tx.status !== 'pending' && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Status Icon */}
        <div className="flex justify-center mb-4">
          {tx.status === 'pending' && (
            <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400">
              <Loader2 className="w-10 h-10 animate-spin" />
            </div>
          )}
          {tx.status === 'success' && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>
          )}
          {tx.status === 'error' && (
            <div className="p-3 rounded-2xl bg-red-500/10 text-red-400">
              <AlertTriangle className="w-10 h-10" />
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-slate-100 mb-1">
          {tx.title || (tx.status === 'pending' ? 'Transaction Pending' : tx.status === 'success' ? 'Confirmed!' : 'Failed')}
        </h3>

        {/* Description / Error message */}
        <p className="text-sm text-slate-300 mb-5 break-words">
          {tx.message || (tx.status === 'pending' ? 'Please confirm the transaction in your NEAR wallet...' : '')}
        </p>

        {/* Tx Explorer Link */}
        {tx.txHash && (
          <div className="mb-5">
            <a
              href={`${APP_CONFIG.explorerUrl}/txns/${tx.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300 hover:underline bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800"
            >
              <span>View on NearBlocks</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Action Button */}
        {tx.status !== 'pending' && (
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 transition"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
};
