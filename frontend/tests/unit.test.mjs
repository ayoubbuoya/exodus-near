import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseUnits,
  parseTokenUnits,
  formatUnits,
  safeAmount,
  calcImpliedApyPercent,
  formatPercent,
  formatIndex,
} from '../src/lib/formatters.ts';
import { normalizeHistory } from '../src/lib/history.ts';
import { readRoute, appHref } from '../src/lib/navigation.ts';
import { estimateLp, integerSqrt } from '../src/lib/liquidity.ts';
import { assertTransactionSucceeded } from '../src/lib/transactions.ts';

test('token amounts retain all 24 decimals, including values above Number precision', () => {
  const amount = '9007199254740993.123456789012345678901234';
  assert.equal(formatUnits(parseUnits(amount), 24), amount);
  assert.equal(parseUnits('.000000000000000000000001'), '1');
  assert.equal(parseTokenUnits('12.123456', 6), '12123456');
  assert.equal(
    parseTokenUnits('1.000000000000000001', 18),
    '1000000000000000001',
  );
});
test('invalid, negative, exponential, and overprecision amounts never reach signing', () => {
  for (const value of [
    '-1',
    'NaN',
    'Infinity',
    '1e6',
    '1.2.3',
    '.',
    '1,000',
    '0.1234567890123456789012345',
  ]) {
    assert.throws(() => parseUnits(value));
    assert.equal(safeAmount(value), 0n);
  }
  assert.equal(safeAmount(''), 0n);
  assert.throws(() => parseTokenUnits('1.0000001', 6));
});
test('missing market rates stay unknown; actual zero and high rates are not fabricated', () => {
  assert.equal(formatPercent(calcImpliedApyPercent(undefined)), '—');
  assert.equal(formatPercent(calcImpliedApyPercent('0')), '0.00%');
  assert.ok(calcImpliedApyPercent('1000000000000000000') > 100);
  assert.equal(formatIndex(undefined), '—');
});
const snapshot = {
  ts: '2026-11-11T13:00:00Z',
  implied_apy: '0.0436',
  underlying_apy: '0.0800',
  py_index: '1050000000000000000',
  total_pt: '1000000000000000000000000',
  total_sy: '2000000000000000000000000',
  tvl_near: '2.1',
};
test('hosted API decimal strings become percentage points and timestamps sort chronologically', () => {
  const points = normalizeHistory([
    snapshot,
    { ...snapshot, ts: '2026-11-11T12:00:00Z', implied_apy: '0' },
  ]);
  assert.equal(points[0].recorded_at, '2026-11-11T12:00:00Z');
  assert.equal(points[0].implied_apy, 0);
  assert.equal(points[1].implied_apy, 4.36);
  assert.equal(points[1].underlying_apy, 8);
  assert.equal(points[1].total_sy, snapshot.total_sy);
  assert.deepEqual(normalizeHistory([]), []);
});
test('malformed history fails explicitly instead of displaying invented yield', () => {
  for (const value of [
    {},
    [null],
    [{ ...snapshot, ts: 'wrong' }],
    [{ ...snapshot, implied_apy: 'NaN' }],
    [{ ...snapshot, implied_apy: '' }],
    [{ ...snapshot, total_pt: '-1' }],
  ])
    assert.throws(() => normalizeHistory(value));
});
test('landing anchors, app deep links, query market selection, and unknown tabs resolve safely', () => {
  assert.equal(readRoute('#how-it-works').isApp, false);
  assert.deepEqual(readRoute('#/app/long?market=demo-mock'), {
    isApp: true,
    tab: 'long',
    marketId: 'demo-mock',
  });
  assert.equal(readRoute('#/app/missing').tab, 'fix');
  assert.equal(readRoute('#/application').isApp, false);
  assert.equal(
    readRoute(appHref('pool', 'linear-31mar27')).marketId,
    'linear-31mar27',
  );
});
test('LP estimates preserve protocol rounding and the initial locked liquidity', () => {
  const unit = 10n ** 24n;
  assert.equal(
    estimateLp(100n * unit, 100n * unit, 0n, 0n, 0n),
    100n * unit - 1000n,
  );
  assert.equal(estimateLp(2n, 100n, 3n, 50n, 7n), 4n);
  const value = 2n ** 127n - 1n,
    root = integerSqrt(value);
  assert.ok(root * root <= value && (root + 1n) * (root + 1n) > value);
  assert.equal(estimateLp(0n, unit, unit, unit, unit), 0n);
});
test('failed receipts, unconfirmed results, and full FT refunds never report success', () => {
  assert.throws(() => assertTransactionSucceeded(null, 'claim_interest'));
  assert.throws(() =>
    assertTransactionSucceeded(
      { status: { SuccessReceiptId: 'pending' } },
      'claim_interest',
    ),
  );
  assert.throws(
    () =>
      assertTransactionSucceeded(
        { status: { Failure: 'INDEX_STALE' } },
        'mint_py',
      ),
    /INDEX_STALE/,
  );
  assert.throws(
    () =>
      assertTransactionSucceeded(
        {
          status: { SuccessValue: '' },
          receipts_outcome: [{ outcome: { status: { Failure: 'slippage' } } }],
        },
        'ft_transfer_call',
      ),
    /slippage/,
  );
  assert.throws(
    () =>
      assertTransactionSucceeded(
        { status: { SuccessValue: btoa(JSON.stringify('0')) } },
        'ft_transfer_call',
      ),
    /returned all/,
  );
  assert.doesNotThrow(() =>
    assertTransactionSucceeded(
      { status: { SuccessValue: btoa(JSON.stringify('123')) } },
      'ft_transfer_call',
    ),
  );
  assert.doesNotThrow(() =>
    assertTransactionSucceeded(
      { status: { SuccessValue: '' } },
      'claim_interest',
    ),
  );
});
