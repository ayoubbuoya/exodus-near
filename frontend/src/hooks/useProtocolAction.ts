import { useRef, useState } from 'react';
import type { TxStatus } from '../types';

export function useProtocolAction(onTxUpdate: (tx: TxStatus) => void) {
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  async function run(title: string, action: () => Promise<any>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    onTxUpdate({
      status: 'pending',
      title,
      message: 'Review and confirm in your wallet. Waiting for NEAR testnet…',
    });
    try {
      const tx = await action();
      onTxUpdate({
        status: 'success',
        title: 'Transaction confirmed',
        message:
          'Your transaction completed on NEAR testnet. Check the updated balances and explorer for the final amounts.',
        txHash: tx?.transaction?.hash,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'The transaction could not be completed. Please try again.';
      onTxUpdate({
        status: 'error',
        title: `${title} unsuccessful`,
        message: message.includes('INDEX_STALE')
          ? 'The staking index needs refreshing. Use “Refresh index” in the workspace, then try again.'
          : message,
      });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}
