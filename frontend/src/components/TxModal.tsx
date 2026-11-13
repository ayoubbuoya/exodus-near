import { Check, ExternalLink, Loader2, TriangleAlert, X } from 'lucide-react';
import { Modal } from './Modal';
import { APP_CONFIG } from '../config';
import type { TxStatus } from '../types';

export function TxModal({
  tx,
  onClose,
}: {
  tx: TxStatus;
  onClose: () => void;
}) {
  return (
    <Modal
      open={tx.status !== 'idle'}
      onClose={onClose}
      labelledBy="transaction-title"
      dismissible={tx.status !== 'pending'}
    >
      <div className="dialog-content transaction-dialog">
        <div className="dialog-top">
          <span className="eyebrow">NEAR TESTNET TRANSACTION</span>
          {tx.status !== 'pending' && (
            <button
              className="icon-button"
              onClick={onClose}
              aria-label="Close transaction status"
            >
              <X size={17} />
            </button>
          )}
        </div>
        <div className={`transaction-status-icon status-${tx.status}`}>
          {tx.status === 'pending' ? (
            <Loader2 size={25} className="animate-spin" />
          ) : tx.status === 'success' ? (
            <Check size={25} />
          ) : (
            <TriangleAlert size={25} />
          )}
        </div>
        <h2 id="transaction-title">{tx.title || 'Transaction status'}</h2>
        <p role="status">{tx.message}</p>
        {tx.txHash && (
          <a
            className="button button-quiet button-small"
            href={`${APP_CONFIG.explorerUrl}/txns/${tx.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on NearBlocks <ExternalLink size={13} />
          </a>
        )}
        {tx.status !== 'pending' && (
          <button className="action-button" onClick={onClose}>
            Back to workspace <Check size={14} />
          </button>
        )}
      </div>
    </Modal>
  );
}
