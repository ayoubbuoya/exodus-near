import { TradePanel } from '../components/TradePanel';
import type { TxStatus } from '../types';
export function LongYieldTab({
  onTxUpdate,
}: {
  onTxUpdate: (tx: TxStatus) => void;
}) {
  return <TradePanel token="YT" onTxUpdate={onTxUpdate} />;
}
