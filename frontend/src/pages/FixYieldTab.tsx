import { TradePanel } from '../components/TradePanel';
import type { TxStatus } from '../types';
export function FixYieldTab({
  onTxUpdate,
}: {
  onTxUpdate: (tx: TxStatus) => void;
}) {
  return <TradePanel token="PT" onTxUpdate={onTxUpdate} />;
}
