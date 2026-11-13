/** A successful outer transaction can still contain a failed cross-contract receipt. */
export function assertTransactionSucceeded(
  result: unknown,
  methodName: string,
) {
  if (!result || typeof result !== 'object')
    throw new Error(
      'The wallet did not return a confirmed transaction. Check your wallet activity.',
    );
  const tx = result as {
    status?: unknown;
    receipts_outcome?: { outcome: { status?: unknown } }[];
  };
  const statuses = [
    tx.status,
    ...(tx.receipts_outcome || []).map((receipt) => receipt.outcome.status),
  ];
  for (const status of statuses) {
    if (status && typeof status === 'object' && 'Failure' in status)
      throw new Error(JSON.stringify(status.Failure));
  }
  if (
    !tx.status ||
    typeof tx.status !== 'object' ||
    !('SuccessValue' in tx.status)
  )
    throw new Error(
      'Confirmation is not available yet. Check your wallet activity before retrying.',
    );
  if (
    methodName === 'ft_transfer_call' &&
    typeof tx.status.SuccessValue === 'string' &&
    tx.status.SuccessValue
  ) {
    let returned: unknown;
    try {
      returned = JSON.parse(atob(tx.status.SuccessValue));
    } catch {
      return;
    }
    if (returned === '0')
      throw new Error(
        'The contract returned all deposited tokens. The action did not execute. Refresh the staking index and check the market before trying again.',
      );
  }
}
