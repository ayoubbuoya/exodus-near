export const minimumLiquidity = 1000n;
export function integerSqrt(value: bigint): bigint {
  if (value < 0n)
    throw new Error('Cannot take the square root of a negative amount.');
  if (value < 2n) return value;
  let x = value,
    next = (x + 1n) / 2n;
  while (next < x) {
    x = next;
    next = (x + value / x) / 2n;
  }
  return x;
}
export function estimateLp(
  sy: bigint,
  pt: bigint,
  totalSy: bigint,
  totalPt: bigint,
  totalLp: bigint,
): bigint {
  if (sy <= 0n || pt <= 0n) return 0n;
  if (totalSy === 0n || totalPt === 0n || totalLp === 0n) {
    const root = integerSqrt(sy * pt);
    return root > minimumLiquidity ? root - minimumLiquidity : 0n;
  }
  const fromSy = (sy * totalLp) / totalSy,
    fromPt = (pt * totalLp) / totalPt;
  return fromSy < fromPt ? fromSy : fromPt;
}
