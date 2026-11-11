import { APP_CONFIG } from '../config';
import { normalizeHistory } from './history';
import type {
  MarketHistoryPoint,
  MarketView,
  PoolView,
  SwapPreviewView,
  UserPositionView,
} from '../types';

/**
 * Standard NEAR JSON-RPC view call without heavy SDK dependencies.
 */
export async function queryViewMethod<T>(
  contractId: string,
  methodName: string,
  args: Record<string, any> = {},
): Promise<T> {
  const argsBase64 = btoa(JSON.stringify(args));

  const response = await fetch(APP_CONFIG.rpcUrl, {
    signal: AbortSignal.timeout(12000),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'exodus-rpc',
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: contractId,
        method_name: methodName,
        args_base64: argsBase64,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP error: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(`RPC call failed: ${JSON.stringify(json.error)}`);
  }

  const resultBytes = json.result.result;
  const decodedString = new TextDecoder().decode(new Uint8Array(resultBytes));
  return JSON.parse(decodedString) as T;
}

export async function fetchMarketView(contractId: string): Promise<MarketView> {
  return queryViewMethod<MarketView>(contractId, 'get_market', {});
}

export async function fetchPoolView(contractId: string): Promise<PoolView> {
  return queryViewMethod<PoolView>(contractId, 'get_pool', {});
}

export async function fetchUserPosition(
  contractId: string,
  accountId: string,
): Promise<UserPositionView> {
  return queryViewMethod<UserPositionView>(contractId, 'get_user', {
    account_id: accountId,
  });
}

export async function fetchFtBalance(
  tokenContractId: string,
  accountId: string,
): Promise<string> {
  return queryViewMethod<string>(tokenContractId, 'ft_balance_of', {
    account_id: accountId,
  });
}

export async function fetchPreviewSyForPt(
  contractId: string,
  syInYocto: string,
): Promise<SwapPreviewView> {
  return queryViewMethod<SwapPreviewView>(
    contractId,
    'preview_swap_exact_sy_for_pt',
    { sy_in: syInYocto },
  );
}

export async function fetchPreviewPtForSy(
  contractId: string,
  ptInYocto: string,
): Promise<SwapPreviewView> {
  return queryViewMethod<SwapPreviewView>(
    contractId,
    'preview_swap_exact_pt_for_sy',
    { pt_in: ptInYocto },
  );
}

export async function fetchPreviewSyForYt(
  contractId: string,
  syInYocto: string,
): Promise<SwapPreviewView> {
  return queryViewMethod<SwapPreviewView>(
    contractId,
    'preview_swap_exact_sy_for_yt',
    { sy_in: syInYocto },
  );
}

export async function fetchPreviewYtForSy(
  contractId: string,
  ytInYocto: string,
): Promise<SwapPreviewView> {
  return queryViewMethod<SwapPreviewView>(
    contractId,
    'preview_swap_exact_yt_for_sy',
    { yt_in: ytInYocto },
  );
}

/** Read indexed history without inventing market data on failure. */
export async function fetchMarketHistory(
  contractId: string,
): Promise<MarketHistoryPoint[]> {
  const res = await fetch(
    `${APP_CONFIG.backendUrl}/markets/${encodeURIComponent(contractId)}/history?limit=1000`,
    {
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!res.ok)
    throw new Error(`Market history is unavailable (HTTP ${res.status}).`);
  return normalizeHistory(await res.json());
}
