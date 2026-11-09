export interface MarketConfig {
  id: string;
  name: string;
  asset: string;
  symbol: string;
  lstContractId: string;
  marketContractId: string;
  maturityFormatted: string;
  expiryNs: number; // nano seconds
  isDemo: boolean;
  decimals: number;
  description: string;
}

export const APP_CONFIG = {
  networkId: 'testnet',
  rpcUrl: 'https://rpc.testnet.near.org',
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001',
  explorerUrl: 'https://testnet.nearblocks.io',
  defaultSlippageBps: 50, // 0.5%
  gasUnits: {
    standard: '50000000000000', // 50 TGas
    swap: '100000000000000',     // 100 TGas
    max: '300000000000000',      // 300 TGas
  },
  markets: [
    {
      id: 'demo-mock',
      name: 'PT MockLST 31MAR2027',
      asset: 'MockLST',
      symbol: 'mLST',
      lstContractId: 'mock-lst.fond-buoya.testnet',
      marketContractId: 'demo-market.fond-buoya.testnet',
      maturityFormatted: '31 Mar 2027',
      expiryNs: 1806451200000000000, // 31 Mar 2027 00:00:00 UTC
      isDemo: true,
      decimals: 24,
      description: 'Demo testnet market with admin-increasable rate for proving yield claims and maturity.',
    },
    {
      id: 'linear-31mar27',
      name: 'PT LiNEAR 31MAR2027',
      asset: 'LiNEAR',
      symbol: 'LiNEAR',
      lstContractId: 'linear-protocol.testnet',
      marketContractId: 'linear-market.fond-buoya.testnet',
      maturityFormatted: '31 Mar 2027',
      expiryNs: 1806451200000000000, // 31 Mar 2027 00:00:00 UTC
      isDemo: false,
      decimals: 24,
      description: 'Official testnet market for LiNEAR liquid staking token.',
    },
  ] as MarketConfig[],
};
