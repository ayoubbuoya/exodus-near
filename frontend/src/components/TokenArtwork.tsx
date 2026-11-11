import { useState, type CSSProperties } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { GlassInstrument } from './GlassInstrument';

export type TokenKind = 'lst' | 'pt' | 'yt' | 'lp';
export type CompositionKind = 'split' | 'principal' | 'yield' | 'pool' | 'intents';

/** The same fitted object across the brand: whole asset, principal body, yield insert. */
export function TokenArtwork({ kind, size = 36, className = '' }: {
  kind: TokenKind;
  size?: number;
  className?: string;
}) {
  const style = { '--token-size': `${size}px` } as CSSProperties;
  if (kind === 'lp') {
    return (
      <span className={`token-art-pair ${className}`} style={style} aria-hidden="true">
        <TokenArtwork kind="lst" size={size * .76} />
        <TokenArtwork kind="pt" size={size * .76} />
      </span>
    );
  }
  return <span className={`token-art token-art-${kind} ${className}`} style={style} aria-hidden="true" />;
}

export function tokenKind(symbol: string): TokenKind {
  return symbol === 'PT' ? 'pt' : symbol === 'YT' ? 'yt' : symbol === 'LP' ? 'lp' : 'lst';
}

export function TokenComposition({ variant = 'split', compact = false }: {
  variant?: CompositionKind;
  compact?: boolean;
}) {
  return (
    <div className={`token-composition composition-${variant} ${compact ? 'composition-compact' : ''}`} aria-hidden="true">
      {variant === 'split' ? (
        <>
          <GlassInstrument progress={1} />
          <div className="composition-labels"><span>PT <small>Principal</small></span><span>YT <small>Yield</small></span></div>
        </>
      ) : variant === 'pool' ? (
        <>
          <div className="pool-assets">
            <div><TokenArtwork kind="lst" size={126} /><span>LST</span></div>
            <span className="pool-pair-plus">+</span>
            <div><TokenArtwork kind="pt" size={126} /><span>PT</span></div>
          </div>
          <span className="composition-caption">Two assets. One pool.</span>
        </>
      ) : variant === 'intents' ? (
        <div className="composition-route"><span>Other chains</span><ArrowRight size={24} /><div><TokenArtwork kind="lst" size={114} /><span>NEAR</span></div></div>
      ) : (
        <>
          <TokenArtwork kind={variant === 'principal' ? 'pt' : 'yt'} size={164} />
          <div className="composition-title"><strong>{variant === 'principal' ? 'PT' : 'YT'}</strong><span>{variant === 'principal' ? 'Principal at maturity' : 'Staking yield until maturity'}</span></div>
        </>
      )}
    </div>
  );
}

/** A single physical action, without a calculator or simulated financial figures. */
export function SplitShowcase() {
  const [separated, setSeparated] = useState(true);
  return (
    <div className={`split-showcase ${separated ? 'is-separated' : 'is-joined'}`}>
      <GlassInstrument progress={separated ? 1 : 0} />
      <div className="split-showcase-caption">
        {separated ? <><span>PT <small>Your principal</small></span><span className="split-plus">+</span><span>YT <small>Your yield</small></span></> : <span>LST <small>Principal and yield, together</small></span>}
      </div>
      <button type="button" className="text-link split-showcase-toggle" aria-pressed={separated} onClick={() => setSeparated(!separated)}>
        {separated ? <RotateCcw size={14} /> : <ArrowRight size={14} />}
        {separated ? 'Bring them together' : 'See the split'}
      </button>
    </div>
  );
}
