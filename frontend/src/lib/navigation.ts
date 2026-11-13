import type { ActiveTab } from '../types';

export const appTabs: ActiveTab[] = [
  'fix',
  'long',
  'pool',
  'mint-redeem',
  'portfolio',
  'intents',
];
export function readRoute(hash: string): {
  isApp: boolean;
  tab: ActiveTab;
  marketId: string | null;
} {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const candidate = path.split('/')[2] as ActiveTab;
  return {
    isApp: path === '/app' || path.startsWith('/app/'),
    tab: appTabs.includes(candidate) ? candidate : 'fix',
    marketId: new URLSearchParams(query).get('market'),
  };
}
export function appHref(tab: ActiveTab, marketId?: string) {
  return `#/app/${tab}${marketId ? `?market=${encodeURIComponent(marketId)}` : ''}`;
}
