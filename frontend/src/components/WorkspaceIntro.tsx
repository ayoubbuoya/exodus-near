import { useState } from 'react';
import { ArrowRight, Check, Compass, Play, X } from 'lucide-react';
import { TokenComposition } from './TokenArtwork';
import { useWallet } from '../context/WalletContext';
import { useMarket } from '../context/MarketContext';
import { appHref } from '../lib/navigation';
import type { ActiveTab } from '../types';

const stories = {
  fix: { label: 'A LITTLE CERTAINTY', title: 'Give your yield a destination.', description: 'Buy principal today. Know its NEAR value at maturity.', variant: 'principal' },
  long: { label: 'FOLLOW THE POSSIBILITIES', title: 'Put your view on yield to work.', description: 'Own the staking rewards. Let the principal take a different path.', variant: 'yield' },
  pool: { label: 'BE PART OF THE FLOW', title: 'Where principal meets possibility.', description: 'Pair LST with PT. Provide liquidity and share the trading fees.', variant: 'pool' },
  'mint-redeem': { label: 'ONE ASSET. TWO POSSIBILITIES.', title: 'Meet the two sides of your yield.', description: 'Keep the principal. Unlock the rewards. Decide what happens next.', variant: 'split' },
} as const;

export function WorkspaceIntro({ tab, onTour }: { tab: ActiveTab; onTour: () => void }) {
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem('exodus-intro-hidden') === '1'; } catch { return false; }
  });
  const story = tab in stories ? stories[tab as keyof typeof stories] : null;
  if (!story || hidden) return null;
  return <section className={`workspace-intro intro-${story.variant}`} aria-label="Discover Exodus">
    <div className="intro-copy"><span className="eyebrow"><span className="intro-live-dot" />{story.label}</span><h2>{story.title}</h2><p>{story.description}</p><button type="button" className="intro-tour" onClick={onTour}><span><Play size={10} fill="currentColor" /></span>See how it works <ArrowRight size={14} /></button></div>
    <TokenComposition variant={story.variant} compact />
    <button type="button" className="intro-dismiss icon-button" aria-label="Hide introduction" onClick={() => { setHidden(true); try { sessionStorage.setItem('exodus-intro-hidden', '1'); } catch { /* Optional preference. */ } }}><X size={15} /></button>
  </section>;
}

export function DemoJourney({ onTour }: { onTour: () => void }) {
  const { isConnected, isConnecting, connect } = useWallet();
  const { selectedMarket, lstBalance, userPosition, balancesReady } = useMarket();
  if (!selectedMarket.isDemo) return null;
  const hasTokens = isConnected && balancesReady && BigInt(lstBalance) > 0n;
  const hasPosition = isConnected && balancesReady && BigInt(userPosition?.pt_balance || '0') > 0n && BigInt(userPosition?.yt_balance || '0') > 0n;
  return <section className="demo-journey" aria-label="Testnet getting started">
    <button type="button" className="journey-label" onClick={onTour}><Compass size={17} /><span>Get started<small>Explore with testnet tokens</small></span></button>
    <div className="journey-steps">
      <button type="button" className={isConnected ? 'done' : 'current'} disabled={isConnecting || isConnected} onClick={() => void connect()}><span>{isConnected ? <Check size={12} /> : '1'}</span>{isConnecting ? 'Connecting…' : 'Connect a wallet'}</button>
      <a href="#demo-tools" className={hasTokens ? 'done' : isConnected ? 'current' : ''} onClick={e => { e.preventDefault(); document.getElementById('demo-tools')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.querySelector<HTMLButtonElement>('#demo-tools button')?.focus({ preventScroll: true }); }}><span>{hasTokens ? <Check size={12} /> : '2'}</span>Get free MockLST</a>
      <a href={appHref('mint-redeem', selectedMarket.id)} className={hasPosition ? 'done' : hasTokens ? 'current' : ''}><span>{hasPosition ? <Check size={12} /> : '3'}</span>Make your first split<ArrowRight size={13} /></a>
    </div>
  </section>;
}
