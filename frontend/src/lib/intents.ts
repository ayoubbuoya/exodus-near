import { APP_CONFIG } from '../config';
import type { OneClickToken, OneClickQuoteResponse } from '../types';

export const POPULAR_TOKENS: OneClickToken[] = [
  {
    assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
    symbol: 'USDC',
    blockchain: 'arbitrum',
    decimals: 6,
    price: 1.0,
    contractAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  },
  {
    assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
    symbol: 'USDC',
    blockchain: 'base',
    decimals: 6,
    price: 1.0,
    contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  },
  {
    assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
    symbol: 'USDC',
    blockchain: 'eth',
    decimals: 6,
    price: 1.0,
    contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  },
  {
    assetId: 'nep141:eth.omft.near',
    symbol: 'ETH',
    blockchain: 'eth',
    decimals: 18,
    price: 2150.0,
  },
  {
    assetId: 'nep141:arb.omft.near',
    symbol: 'ETH',
    blockchain: 'arbitrum',
    decimals: 18,
    price: 2150.0,
  },
  {
    assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
    symbol: 'USDC',
    blockchain: 'sol',
    decimals: 6,
    price: 1.0,
  },
];

/**
 * Fetches all supported cross-chain tokens from backend proxy with public 1Click fallback.
 */
export async function fetchSupportedTokens(): Promise<OneClickToken[]> {
  try {
    const res = await fetch(`${APP_CONFIG.backendUrl}/intents/tokens`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch {
    // Backend offline or unreachable, try direct 1Click public endpoint
  }

  try {
    const res = await fetch('https://1click.chaindefuser.com/v0/tokens', {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch {
    // Fall back to curated popular tokens
  }

  return POPULAR_TOKENS;
}

export interface RequestQuoteParams {
  dry: boolean;
  originAsset: string;
  amountBaseUnits: string;
  recipientAccountId: string;
  refundAddress?: string;
}

/**
 * Requests a swap quote from NEAR Intents 1Click via backend proxy or direct API.
 */
export async function requestIntentsQuote(
  params: RequestQuoteParams,
): Promise<OneClickQuoteResponse> {
  const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Valid non-zero fallback refund address per chain family (1Click rejects 0x00...00)
  const isSolana =
    params.originAsset.includes(':sol') || params.originAsset.includes('sol-');
  const defaultRefund = isSolana
    ? '4Nd1mBQv2msnmf58R91eQ5xWn6L6p4T4C7qE9pM5eQvQ'
    : '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

  const refundTo =
    params.refundAddress && params.refundAddress.trim().length > 0
      ? params.refundAddress.trim()
      : defaultRefund;

  // For dry-run quotes without a recipient or with a testnet recipient, use 'exodus.near'
  const recipient =
    params.dry ||
    !params.recipientAccountId ||
    params.recipientAccountId.endsWith('.testnet')
      ? 'exodus.near'
      : params.recipientAccountId;

  const payload = {
    dry: params.dry,
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100, // 1%
    originAsset: params.originAsset,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: 'nep141:wrap.near',
    amount: params.amountBaseUnits,
    refundTo,
    refundType: 'ORIGIN_CHAIN',
    recipient,
    recipientType: 'DESTINATION_CHAIN',
    deadline,
  };

  // 1. Try backend proxy
  try {
    const res = await fetch(`${APP_CONFIG.backendUrl}/intents/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.quote) {
        return data;
      }
    }
  } catch {
    // Fall back to direct 1Click call
  }

  // 2. Direct 1Click call fallback
  const directRes = await fetch('https://1click.chaindefuser.com/v0/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!directRes.ok) {
    const errJson = await directRes.json().catch(() => ({}));
    throw new Error(errJson.message || `1Click error: ${directRes.statusText}`);
  }

  return directRes.json();
}

/**
 * Checks deposit status for a real cross-chain execution.
 */
export async function checkDepositStatus(depositAddress: string): Promise<any> {
  try {
    const res = await fetch(
      `${APP_CONFIG.backendUrl}/intents/status/${encodeURIComponent(depositAddress)}`,
      {
        signal: AbortSignal.timeout(4000),
      },
    );
    if (res.ok) return await res.json();
  } catch {
    // Fallback direct
  }

  const directRes = await fetch(
    `https://1click.chaindefuser.com/v0/status/${encodeURIComponent(depositAddress)}`,
  );
  if (!directRes.ok) {
    throw new Error(`Failed to check status: ${directRes.statusText}`);
  }
  return directRes.json();
}
