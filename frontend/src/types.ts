export interface MarketView {
  owner_id: string;
  treasury_id: string;
  lst_id: string;
  rate_source: string;
  expiry_ns: number;
  interest_fee_bps: number;
  paused: boolean;
  py_index: string;
  index_epoch: number;
  index_updated_ns: number;
  index_at_maturity?: string | null;
  pt_total_supply: string;
  yt_total_supply: string;
  sy_reserved_for_interest: string;
  treasury_sy: string;
  total_pt: string;
  total_sy: string;
  total_lp: string;
  last_ln_implied_rate: string;
}

export interface PoolView {
  total_pt: string;
  total_sy: string;
  total_lp: string;
  last_ln_implied_rate: string;
  scalar_root: string;
  ln_fee_rate_root: string;
}

export interface UserPositionView {
  pt_balance: string;
  yt_balance: string;
  user_index: string;
  accrued_sy: string;
  pending_refund: string;
  lp_balance: string;
}

export interface SwapPreviewView {
  amount_out: string;
  fee_sy: string;
  new_last_ln_implied_rate: string;
}

export interface MarketHistoryPoint {
  recorded_at: string;
  implied_apy: number;
  underlying_apy: number;
  py_index: string;
  total_pt: string;
  total_sy: string;
  tvl_near: number;
}

export type ActiveTab = 'fix' | 'pool' | 'mint-redeem' | 'portfolio';

export interface TxStatus {
  status: 'idle' | 'pending' | 'success' | 'error';
  title?: string;
  message?: string;
  txHash?: string;
}
