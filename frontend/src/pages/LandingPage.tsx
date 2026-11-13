import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Menu,
  MoveUpRight,
  X,
} from 'lucide-react';
import { Brand, Mark } from '../components/Brand';
import { GlassInstrument } from '../components/GlassInstrument';
import { APP_CONFIG } from '../config';
import { TokenArtwork, TokenComposition, SplitShowcase } from '../components/TokenArtwork';

const faqs = [
  [
    'What does Exodus actually split?',
    'Exodus splits the value of a liquid staking token into two rights: principal (PT) and staking yield (YT). The number minted depends on the LST’s NEAR exchange rate. Both tokens belong to a market with a specific maturity date.',
  ],
  [
    'How does fixed yield work?',
    'Buy PT at a discount to its maturity value. Each PT redeems for 1 NEAR worth of the underlying LST after maturity. Your purchase price determines your return if held to maturity. Selling early gets the current AMM price. Smart contract and underlying LST risks still apply.',
  ],
  [
    'What happens to my yield tokens at maturity?',
    'YT earns the staking yield associated with its principal until the market matures. After maturity it stops accruing new yield and has no principal redemption value. Previously accrued yield remains claimable.',
  ],
  [
    'Can I try it without real funds?',
    'Yes. Exodus is deployed on NEAR testnet. Connect a testnet wallet, select MockLST, and use the in-app faucet to request demo tokens. LiNEAR is a separate testnet market. Cross-chain quotes preview mainnet routes and do not move funds.',
  ],
  [
    'Is the protocol audited?',
    'No. This is experimental hackathon software, running on testnet. The contracts, fixed-point math, and integration tests are open source. Never send mainnet funds to the testnet contracts.',
  ],
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    page.current
      ?.querySelectorAll('[data-reveal]')
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing" ref={page}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="landing-header wrap">
        <nav className="landing-nav" aria-label="Main navigation">
          <Brand />
          <div className="desktop-links">
            <a href="#how-it-works">How it works</a>
            <a href="#strategies">Strategies</a>
            <a href="#markets">Markets</a>
          </div>
          <div className="nav-actions">
            <a
              className="button button-bright button-small"
              href="#/app/fix"
              aria-label="Launch app"
            >
              <span className="launch-label">Launch app</span>
              <span className="launch-label-short" aria-hidden="true">
                App
              </span>{' '}
              <ArrowUpRight size={15} />
            </a>
            <button
              className="icon-button mobile-menu-toggle"
              aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </nav>
        {menuOpen && (
          <nav
            id="mobile-nav"
            className="mobile-nav"
            aria-label="Mobile navigation"
          >
            {[
              ['How it works', 'how-it-works'],
              ['Strategies', 'strategies'],
              ['Markets', 'markets'],
              ['FAQs', 'faq'],
            ].map(([label, id]) => (
              <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>
                {label}
                <ArrowUpRight size={16} />
              </a>
            ))}
          </nav>
        )}
      </header>
      <main id="main">
        <section className="hero wrap" aria-labelledby="hero-title">
          <div className="hero-copy">
            <a className="network-label" href="#/app/fix">
              <span  /> BUILT ON NEAR{' '}
              <span className="label-divider" /> TESTNET IS LIVE{' '}
              <ArrowUpRight size={12} />
            </a>
            <h1 id="hero-title">
              Your yield.
              <br />
              Your <span className="silver-text">terms.</span>
            </h1>
            <p>
              Separate your principal from your staking yield.
              <br className="desktop-break" /> Lock a rate. Trade the upside.
              Make it yours.
            </p>
            <div className="hero-actions">
              <a className="button button-bright" href="#/app/fix">
                Explore markets{' '}
                <span className="button-arrow">
                  <ArrowUpRight size={18} />
                </span>
              </a>
              <a className="text-link" href="#how-it-works">
                Meet your new options <ArrowDown size={16} />
              </a>
            </div>
            <div className="hero-proof">
              <span>
                 Permissionless
              </span>
              <span>
                 Non-custodial
              </span>
              <span>
                Open source
              </span>
            </div>
          </div>
          <div className="hero-art">
            <GlassInstrument hero />
          </div>
        </section>
        <div className="protocol-strip wrap">
          <span className="eyebrow">A new dimension for liquid staking</span>
          <div>
            <span className="near-word">
              NEAR<span className="tiny-cross">↗</span>
            </span>
            <span className="strip-divider" />
            <span>LiNEAR</span>
            <span className="demo-token">
              <Mark /> MockLST <small>DEMO</small>
            </span>
          </div>
        </div>
        <section
          className="split-section wrap section-space"
          id="how-it-works"
          aria-labelledby="split-title"
        >
          <div className="section-top" data-reveal>
            <span className="eyebrow">
               THE SPLIT
            </span>
            <span className="section-aside mono">
              A LITTLE SEPARATION. A LOT MORE POSSIBILITY.
            </span>
          </div>
          <div className="split-layout">
            <div className="split-copy" data-reveal>
              <h2 id="split-title">
                One deposit.
                <br />
                <span className="muted">Two ways forward.</span>
              </h2>
              <p>
                Your liquid staking token already does two things: holds your
                principal and earns yield. Exodus lets you choose what to do
                with each.
              </p>
              <div className="split-legend">
                <div>
                  <TokenArtwork kind="pt" size={46} />
                  <div>
                    <h3>Your principal, defined.</h3>
                    <p>
                      Redeem each PT for 1 NEAR worth of LST at maturity. Buy
                      below that value to fix your return.
                    </p>
                  </div>
                </div>
                <div>
                  <TokenArtwork kind="yt" size={46} />
                  <div>
                    <h3>Your yield, unlocked.</h3>
                    <p>
                      Collect the staking yield on its associated principal
                      until maturity. Trade your view on future rates.
                    </p>
                  </div>
                </div>
              </div>
              <a className="text-link" href="#/app/mint-redeem">
                Try the split <ArrowRight size={16} />
              </a>
            </div>
            <div className="split-art" data-reveal><SplitShowcase /></div>
          </div>
        </section>
        <section
          className="strategy-section section-space"
          id="strategies"
          aria-labelledby="strategy-title"
        >
          <div className="wrap">
            <div className="section-top" data-reveal>
              <span className="eyebrow">
                FIND YOUR ANGLE
              </span>
              <span className="section-aside">
                Same protocol. Different possibilities.
              </span>
            </div>
            <div className="section-heading" data-reveal>
              <h2 id="strategy-title">
                What’s your
                <br />
                <span className="muted">next move?</span>
              </h2>
              <p>
                A rate you can plan around. Exposure to future yield. Or a share
                of every swap.
              </p>
            </div>
            <div className="strategy-grid">
              <a
                className="strategy-card principal-card"
                href="#/app/fix"
                data-reveal
              >
                <div className="card-topline">
                  <span className="eyebrow">THE STEADY HAND</span>
                  <ArrowUpRight size={21} />
                </div>
                <div className="strategy-visual">
                  <TokenArtwork kind="pt" size={180} />
                </div>
                <div className="strategy-content">
                  <span className="strategy-tag">PRINCIPAL TOKEN</span>
                  <h3>Fix your yield.</h3>
                  <p>
                    Buy PT at a discount. Know its NEAR-denominated maturity
                    value before you enter.
                  </p>
                  <span className="strategy-action">
                    Explore fixed yield <ArrowRight size={16} />
                  </span>
                </div>
              </a>
              <a
                className="strategy-card yield-card"
                href="#/app/long"
                data-reveal
              >
                <div className="card-topline">
                  <span className="eyebrow">THE FORWARD THINKER</span>
                  <ArrowUpRight size={21} />
                </div>
                <div className="strategy-visual">
                  <TokenArtwork kind="yt" size={180} />
                </div>
                <div className="strategy-content">
                  <span className="strategy-tag yield-ink">YIELD TOKEN</span>
                  <h3>Follow the upside.</h3>
                  <p>
                    Get exposure to future staking yield without buying the
                    underlying principal.
                  </p>
                  <span className="strategy-action">
                    Explore long yield <ArrowRight size={16} />
                  </span>
                </div>
              </a>
              <a
                className="strategy-card liquidity-card"
                href="#/app/pool"
                data-reveal
              >
                <div className="card-topline">
                  <span className="eyebrow">THE MARKET MAKER</span>
                  <ArrowUpRight size={21} />
                </div>
                <div className="strategy-visual market-maker-art"><TokenComposition variant="pool" /></div>
                <div className="strategy-content">
                  <span className="strategy-tag">LIQUIDITY PROVIDER</span>
                  <h3>Keep it moving.</h3>
                  <p>
                    Supply PT and LST to the logit AMM and earn your share of
                    trading fees.
                  </p>
                  <span className="strategy-action">
                    Explore liquidity <ArrowRight size={16} />
                  </span>
                </div>
              </a>
            </div>
            <p className="strategy-footnote">
              Returns depend on market conditions. YT can lose its full purchase
              value. LP positions carry market and smart contract risk.
            </p>
          </div>
        </section>
        <section
          className="markets-section wrap section-space"
          id="markets"
          aria-labelledby="markets-title"
        >
          <div className="section-top" data-reveal>
            <span className="eyebrow">
               OPEN FOR EXPLORATION
            </span>
            <span className="network-label">
              <span className="status-dot" /> NEAR TESTNET
            </span>
          </div>
          <div className="section-heading" data-reveal>
            <h2 id="markets-title">
              Put your NEAR
              <br />
              <span className="muted">in perspective.</span>
            </h2>
            <p>
              Start with demo tokens or explore the LiNEAR market. Every market
              has a clear asset and a defined maturity.
            </p>
          </div>
          <div className="landing-market-table" data-reveal>
            <div className="market-table-header">
              <span>Underlying asset</span>
              <span>Maturity</span>
              <span>Environment</span>
              <span />
            </div>
            {APP_CONFIG.markets.map((market) => (
              <a
                className="market-table-row"
                href={`#/app/fix?market=${market.id}`}
                key={market.id}
              >
                <div className="market-asset">
                  <span
                    className={`asset-avatar ${market.isDemo ? 'mock-avatar' : 'linear-avatar'}`}
                  >
                    <TokenArtwork kind="lst" size={42} />
                  </span>
                  <div>
                    <strong>{market.asset}</strong>
                    <span>
                      {market.isDemo
                        ? 'Explore the full lifecycle'
                        : 'Liquid staking on NEAR'}
                    </span>
                  </div>
                </div>
                <span className="market-maturity">
                  {market.maturityFormatted}
                </span>
                <span>
                  <span className="badge">
                    {market.isDemo ? 'Demo market' : 'Testnet'}
                  </span>
                </span>
                <ArrowUpRight size={20} />
              </a>
            ))}
          </div>
          <div className="market-bottom">
            <span>
              <span  />
            </span>
            <a className="text-link" href="#/app/fix">
              Open the app <ArrowRight size={16} />
            </a>
          </div>
        </section>
        <section className="intent-feature wrap" data-reveal>
          <div>
            <span className="eyebrow">POWERED BY NEAR INTENTS</span>
            <h2>
              Different chains.
              <br />
              <span className="muted">A closer connection.</span>
            </h2>
            <p>
              Explore live 1Click quotes from Ethereum, Arbitrum, Base, and
              Solana to NEAR. Preview the route before making a move.
            </p>
            <a className="text-link" href="#/app/intents">
              Explore cross-chain quotes <MoveUpRight size={16} />
            </a>
          </div>
          <div className="chain-path" aria-hidden="true">
            <div className="chain-sources">
              <span>ETH</span>
              <span>BASE</span>
              <span>SOL</span>
            </div>
            <div className="chain-connector">
              <i />
              <ArrowRight size={20} />
              <i />
            </div>
            <div className="chain-destination">
              NEAR<span>INTENTS</span>
            </div>
          </div>
          <span className="intent-preview-label mono">
            QUOTE PREVIEW · NO FUNDS MOVED
          </span>
        </section>
        <section
          className="faq-section wrap section-space"
          id="faq"
          aria-labelledby="faq-title"
        >
          <div data-reveal>
            <span className="eyebrow">
              <span className="section-number">04 /</span> A LITTLE CLARITY
            </span>
            <h2 id="faq-title">
              Good questions.
              <br />
              <span className="muted">Clear answers.</span>
            </h2>
            <a
              className="text-link"
              href="https://github.com/ayoubbuoya/exodus-near#readme"
              target="_blank"
              rel="noreferrer"
            >
              Read the documentation <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="faq-list" data-reveal>
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <ChevronDown size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing-section wrap" data-reveal>
          <Mark />
          <span className="eyebrow">THE NEXT MOVE IS YOURS</span>
          <h2>
            A little more control.
            <br />
            <span className="muted">A whole new outlook.</span>
          </h2>
          <a className="button button-bright" href="#/app/fix">
            Make your first move{' '}
            <span className="button-arrow">
              <ArrowUpRight size={18} />
            </span>
          </a>
          <span className="closing-note">
            Explore on testnet. Start with demo tokens.
          </span>
        </section>
      </main>
      <footer className="site-footer wrap">
        <div className="footer-top">
          <Brand />
          <div>
            <a
              href="https://github.com/ayoubbuoya/exodus-near"
              target="_blank"
              rel="noreferrer"
            >
              GitHub <ArrowUpRight size={13} />
            </a>
            <a href="#faq">FAQs</a>
            <a href="#/app/fix">
              Launch app <ArrowUpRight size={13} />
            </a>
          </div>
          <span className="footer-network">
            BUILT ON <strong>NEAR ↗</strong>
          </span>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Exodus on NEAR</span>
          <p>
            Experimental, unaudited software. Testnet only. Built for the NEAR
            Hackathon.
          </p>
        </div>
      </footer>
    </div>
  );
}
