/**
 * Formatting and BigInt conversion helpers for Exodus on NEAR.
 * Token amounts use 24 decimals (yoctoNEAR).
 * Protocol rates & indexes use 18 decimals (FP_ONE = 1e18).
 */

const YOCTO_DECIMALS = 24n;
const YOCTO_BASE = 10n ** YOCTO_DECIMALS;
const FP_ONE = 10n ** 18n;

/**
 * Converts a 24-decimal yocto string to a human-readable float/string.
 */
export function formatUnits(
  amount: string | number | bigint | undefined,
  decimals = 4,
): string {
  if (!amount || amount === '0') return '0';
  try {
    const rawStr = amount.toString();
    const isNegative = rawStr.startsWith('-');
    const cleanStr = isNegative ? rawStr.slice(1) : rawStr;
    const big = BigInt(cleanStr);

    const whole = big / YOCTO_BASE;
    const remainder = big % YOCTO_BASE;

    // Pad remainder to 24 digits
    let remStr = remainder.toString().padStart(24, '0');
    // Truncate to desired display decimals
    remStr = remStr.slice(0, decimals).replace(/0+$/, '');

    const prefix = isNegative ? '-' : '';
    if (!remStr) return `${prefix}${whole.toString()}`;
    return `${prefix}${whole.toString()}.${remStr}`;
  } catch {
    return '0';
  }
}

/**
 * Parses user input (e.g. "1.52") into a 24-decimal yocto string.
 */
export function parseUnits(input: string): string {
  return parseTokenUnits(input, 24);
}

export function parseTokenUnits(input: string, decimals: number): string {
  const clean = input.trim();
  if (!clean) return '0';
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36 ||
    !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean)
  )
    throw new Error('Enter a valid positive decimal amount.');
  const [whole = '0', fraction = ''] = clean.split('.');
  if (fraction.length > decimals)
    throw new Error(`Use at most ${decimals} decimal places.`);
  return (
    BigInt(whole || '0') * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, '0') || '0')
  ).toString();
}

export function safeAmount(input: string): bigint {
  try {
    return BigInt(parseUnits(input));
  } catch {
    return 0n;
  }
}

/**
 * Formats a 18-decimal index (e.g. 1300000000000000000) to "1.3000".
 */
export function formatIndex(
  indexRaw: string | number | undefined,
  decimals = 4,
): string {
  if (!indexRaw || indexRaw === '0') return '—';
  try {
    const big = BigInt(indexRaw.toString());
    const whole = big / FP_ONE;
    const rem = (big % FP_ONE).toString().padStart(18, '0').slice(0, decimals);
    return `${whole.toString()}.${rem}`;
  } catch {
    return '—';
  }
}

/**
 * Calculates Implied APY percentage from ln_implied_rate (18-decimal fixed-point string).
 * r = exp(ln_rate) - 1
 */
export function calcImpliedApyPercent(lnRateStr: string | undefined): number {
  if (lnRateStr === undefined) return NaN;
  try {
    const raw = Number(BigInt(lnRateStr)) / 1e18;
    if (!Number.isFinite(raw) || raw < 0) return NaN;
    const apy = (Math.exp(raw) - 1) * 100;
    return Number.isFinite(apy) ? apy : NaN;
  } catch {
    return NaN;
  }
}

/**
 * Formats percentage display.
 */
export function formatPercent(val: number, decimals = 2): string {
  return Number.isFinite(val) ? `${val.toFixed(decimals)}%` : '—';
}

/**
 * Calculates days remaining until expiration given nanosecond timestamp.
 */
export function getDaysRemaining(expiryNs: number): number {
  const nowMs = Date.now();
  const expiryMs = expiryNs / 1_000_000;
  const diffMs = expiryMs - nowMs;
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Shortens a NEAR account address or transaction hash.
 */
export function shortenAddress(address: string, chars = 6): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
