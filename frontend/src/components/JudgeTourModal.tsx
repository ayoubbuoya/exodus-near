import { useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, X } from 'lucide-react';
import { Modal } from './Modal';
import { Mark } from './Brand';
import type { ActiveTab } from '../types';

const steps: {
  title: string;
  label: string;
  tab: ActiveTab;
  description: string;
  points: string[];
}[] = [
  {
    title: 'One asset. Two possibilities.',
    label: 'THE SPLIT',
    tab: 'mint-redeem',
    description:
      'Exodus separates liquid staking tokens into principal and yield. The staking index determines how much of each you receive.',
    points: [
      'PT represents 1 NEAR worth of LST at maturity.',
      'YT earns staking yield until that same maturity.',
      'Try MockLST with the free testnet faucet.',
    ],
  },
  {
    title: 'A rate you can plan around.',
    label: 'FIXED YIELD',
    tab: 'fix',
    description:
      'Buy PT below its maturity value. Your purchase price determines the NEAR-denominated return when held to maturity.',
    points: [
      'Quotes come directly from the on-chain AMM.',
      'Choose your slippage before approving a trade.',
      'Early exits use the current market price; contract and LST risks apply.',
    ],
  },
  {
    title: 'A view on future staking.',
    label: 'LONG YIELD',
    tab: 'long',
    description:
      'Buy YT to gain exposure to staking yield without buying the underlying principal. Your result depends on future rates and time remaining.',
    points: [
      'Claim accrued staking yield from your portfolio.',
      'YT has no principal redemption value at maturity.',
      'You can lose the entire YT purchase price.',
    ],
  },
  {
    title: 'A share in the flow.',
    label: 'LIQUIDITY',
    tab: 'pool',
    description:
      'Supply PT and LST to the Pendle-style logit AMM. LP shares track your proportional claim on both pool assets.',
    points: [
      'Paired deposit amounts follow the pool ratio.',
      'LPs share trading fees and carry market risk.',
      'Withdrawals, redemptions, and claims remain available while paused.',
    ],
  },
  {
    title: 'Different chains. One preview.',
    label: 'NEAR INTENTS',
    tab: 'intents',
    description:
      'Get live cross-chain quotes through NEAR Intents 1Click. Explore a route from an origin chain to wrapped NEAR.',
    points: [
      'Quotes use mainnet assets; Exodus markets use testnet.',
      'Preview mode never creates a live deposit address.',
      'No funds are bridged and no PT is purchased by the preview.',
    ],
  },
];

export function JudgeTourModal({
  isOpen,
  onClose,
  onNavigateTab,
}: {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: ActiveTab) => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  return (
    <Modal open={isOpen} onClose={onClose} labelledBy="tour-title">
      <div className="dialog-content tour-dialog">
        <div className="dialog-top">
          <span className="eyebrow">A LITTLE ORIENTATION</span>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close quick tour"
          >
            <X size={17} />
          </button>
        </div>
        <div className="tour-mark">
          <Mark />
          <span className="eyebrow">
            {step.label} · {index + 1} / {steps.length}
          </span>
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.description}</p>
        <ul className="tour-points">
          {step.points.map((point) => (
            <li key={point}>
              <Check size={13} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <nav className="tour-progress" aria-label="Tour steps">
          {steps.map((item, i) => (
            <button
              key={item.tab}
              className={i === index ? 'selected' : ''}
              aria-label={`Step ${i + 1}: ${item.label}`}
              aria-current={i === index ? 'step' : undefined}
              onClick={() => setIndex(i)}
            />
          ))}
        </nav>
        <div className="tour-navigation">
          <button
            className="text-link"
            onClick={() => {
              onNavigateTab(step.tab);
              onClose();
            }}
          >
            Explore this feature <ArrowUpRight size={13} />
          </button>
          <div>
            {index > 0 && (
              <button
                className="icon-button"
                onClick={() => setIndex(index - 1)}
                aria-label="Previous tour step"
              >
                <ArrowLeft size={15} />
              </button>
            )}
            <button
              className="button button-bright button-small"
              onClick={() =>
                index === steps.length - 1 ? onClose() : setIndex(index + 1)
              }
            >
              {index === steps.length - 1 ? 'Ready to explore' : 'Next'}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
