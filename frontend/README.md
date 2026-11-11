# Exodus on NEAR frontend

React 19 + Vite + TypeScript. The landing page and trading workspace share the
Glacier design adapted from Farouk's Exodus reference project: silver principal,
blue glass yield, layered Blender artwork, and the original split animation.
The landing page uses self-hosted Public Sans. The app follows the reference's
Inter typography, floating glass navigation, rounded market stat cards, and
action panels beside position summaries. Both views use readable labels
and tabular financial values; monospace is reserved for account identifiers.

## Appearance

The site uses the Glacier dark palette throughout the landing page, trading
workspace, charts, inputs, and dialogs. Browser color preferences and previously
saved theme choices do not change its appearance.

## Run

Use Node 22.18+ (Node 24 recommended for the built-in TypeScript test runner).

```sh
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. `npm run build` checks TypeScript and creates `dist/`.
Serve `dist/` with any static host. Navigation uses hashes, so deep links work
without a server-side history rewrite.

| Route                | View                                                      |
| -------------------- | --------------------------------------------------------- |
| `/`                  | Landing page, interactive split, strategies, markets, FAQ |
| `/#/app/fix`         | Buy and sell principal tokens                             |
| `/#/app/long`        | Buy and sell yield tokens                                 |
| `/#/app/pool`        | Add or withdraw liquidity                                 |
| `/#/app/mint-redeem` | Mint, paired redemption, matured PT redemption            |
| `/#/app/portfolio`   | Holdings and accrued yield claims                         |
| `/#/app/intents`     | NEAR Intents mainnet quote preview                        |

Append `?market=demo-mock` or `?market=linear-31mar27` inside the hash to select a
market. The selected market is retained when navigating between app views.

## Backend and network

The default backend is `https://api-exodus-near.buoya.space`. Copy `.env.example`
to `.env.local` to override `VITE_BACKEND_URL`, then restart Vite. Vite embeds
this public URL at build time. Trailing slashes and surrounding spaces are
removed. No API credentials are needed in the frontend.

- Indexed history uses `/markets/{contract_id}/history?limit=1000`.
- The history adapter converts backend `ts` timestamps and decimal-string rates
  into chart timestamps and percentages. Missing history is shown explicitly.
- The underlying rate is labelled as a backend benchmark/projection; the backend
  seeds it at 8% and estimates changes from index movement.
- On-chain views, balances, and executable quotes use NEAR testnet RPC. Writes
  go through NEAR Connect and require the user's wallet signature.
- Market views refresh every 15 seconds. History refreshes every minute. Trade
  previews refresh when the pool snapshot changes and are invalidated when the
  amount, market, or direction changes.
- The current backend limits history to its earliest 1,000 records. The frontend
  does not invent newer records; on-chain market metrics are fetched separately.
- NEAR Intents 1Click operates with mainnet assets. The testnet UI requests only
  `dry: true` quotes. It does not register deposits, bridge funds, or buy PT from
  a cross-chain quote. The existing backend/direct API fallback is retained.

## Explore with a wallet

1. Connect a NEAR **testnet** wallet with testnet NEAR for gas.
2. Select MockLST and choose **Get demo tokens**. The faucet has a cooldown.
3. If a transaction reports `INDEX_STALE`, choose **Refresh index**, then retry.
4. Mint paired PT + YT, trade PT/YT, or supply paired liquidity.
5. View holdings and claim accrued YT interest in Portfolio.

New trades, minting, and deposits require an active market. Pausing and maturity
do not disable paired redemption, yield claims, or liquidity withdrawals.
PT-only redemption opens after maturity. The UI makes no admin-only yield-rate
changes. The quick tour explains the available flows and their limitations.

## Checks

```sh
npm test
npm run build
```

The eight unit checks cover 24-decimal input precision, invalid amounts, missing
rates, API history conversion, malformed responses, deep links, LP rounding,
failed transaction receipts, and fully refunded token transfers.

`tests/browser-smoke.mjs` uses an optional Playwright installation. With Vite
running on port 3000, install the QA tool separately if needed and run:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

To use a separately installed Playwright package or Chromium, set
`EXODUS_PLAYWRIGHT_MODULE` to its `index.mjs` file URL and
`EXODUS_CHROMIUM_PATH` to the browser executable. `EXODUS_TEST_URL` can override
the local Vite URL. No extra dependency is added to the application.

The browser suite uses explicit wallet, API, and RPC fixtures. It checks request
payloads and slippage, delayed quote races, market switching, rejection feedback,
all six screens in dark mode at eight viewport sizes, mobile navigation, FAQ and split controls,
dialog focus/keyboard behavior, history failure/recovery, and paused/matured
exits. It never signs or sends a real transaction. Screenshots and failure
diagnostics go into the ignored `node_modules/.cache/exodus-qa/` directory.
Appearance checks verify that Public Sans loads, body copy stays at least 16px,
visible UI text stays at least 12px, primary text tokens maintain 4.5:1 contrast,
dialogs use the dark palette, and dark mode stays active across reloads even with
a previously saved light preference or a light browser color scheme.

Live verification also checked the hosted health/history endpoints, a successful
dry-run 1Click quote, real indexed history in the browser, and the actual wallet
selector. Signed on-chain execution still requires a wallet-driven testnet pass.

## Code map

| Files                                                                              | Responsibility                                                         |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/App.tsx`, `src/lib/navigation.ts`                                             | Landing/app navigation and lazy app loading                            |
| `src/pages/LandingPage.tsx`                                                        | Product narrative, strategies, markets, FAQ                            |
| `src/components/Brand.tsx`, `GlassInstrument.tsx`, `public/`                       | Reused brand, responsive artwork, fonts and licenses                   |
| `src/index.css`, `src/styles/`                                                     | Typography, light/dark palette, responsive layouts, motion             |
| `src/pages/ApplicationPage.tsx`, `components/Navbar.tsx`                           | Workspace navigation, market selection, faucet and index tools         |
| `src/components/TradePanel.tsx`, `ProtocolUI.tsx`                                  | PT/YT trade forms, settings, labelled inputs, quote guards             |
| `src/pages/PoolTab.tsx`, `MintRedeemTab.tsx`, `PortfolioTab.tsx`, `IntentsTab.tsx` | Liquidity, tokenization, holdings, quote preview                       |
| `src/context/`                                                                     | Wallet lifecycle and market/account-specific snapshots                 |
| `src/components/ApyChart.tsx`, `MarketStats.tsx`                                   | Indexed history and on-chain metrics                                   |
| `src/lib/history.ts`, `formatters.ts`, `liquidity.ts`, `transactions.ts`           | API adaptation, precise amounts, LP estimates, confirmation validation |
| `src/components/Modal.tsx`, `TxModal.tsx`, `JudgeTourModal.tsx`                    | Native accessible dialogs, transaction feedback and guided tour        |

Experimental, unaudited software running on NEAR testnet.
