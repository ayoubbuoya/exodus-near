import type { MarketHistoryPoint } from '../types';

/** Axum serializes decimal rates as strings and uses `ts` for snapshot time. */
export function normalizeHistory(payload: unknown): MarketHistoryPoint[] {
  if (!Array.isArray(payload))
    throw new Error('The history API returned an unexpected response.');
  return payload
    .map((row: unknown) => {
      if (!row || typeof row !== 'object')
        throw new Error('Invalid market snapshot.');
      const point = row as Record<string, unknown>;
      const date = typeof point.ts === 'string' ? point.ts : '';
      const rate = (value: unknown) => {
        if (
          typeof value !== 'string' ||
          !value.trim() ||
          !Number.isFinite(Number(value))
        )
          throw new Error('Invalid rate in market history.');
        return Number(value) * 100;
      };
      if (!date || !Number.isFinite(Date.parse(date)))
        throw new Error('Invalid timestamp in market history.');
      for (const field of ['py_index', 'total_pt', 'total_sy'])
        if (
          typeof point[field] !== 'string' ||
          !/^\d+$/.test(point[field] as string)
        )
          throw new Error('Invalid amount in market history.');
      const tvl = Number(point.tvl_near);
      if (point.tvl_near == null || !Number.isFinite(tvl))
        throw new Error('Invalid liquidity in market history.');
      return {
        recorded_at: date,
        implied_apy: rate(point.implied_apy),
        underlying_apy: rate(point.underlying_apy),
        py_index: point.py_index as string,
        total_pt: point.total_pt as string,
        total_sy: point.total_sy as string,
        tvl_near: tvl,
      };
    })
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
}
