# Exodus on NEAR: Handoff

Last updated: 6 Nov 2026. Update this file at the end of every work session.

For anyone joining (teammate or coding agent): read this file first, then `overview.md`, `SPEC.md`, `TECH_architecture.md`.

---

## 1. Current state

- **Phase:** Steps 1 through 5 completed (`exodus-math`, `mock-lst`, and `market` contract tokenization/index/YT interest/maturity all passing). Ready for Step 6 (`market` contract: AMM PT swaps + liquidity).
- **Hackathon:** NEAR HACKATHON, deadline 14 Nov 2026 23:59 UTC. Public repo + LICENSE + X demo post + one submission.
- **Sister project:** Fondouk (AI town of DeFi agents), same author, same hackathon. Both READMEs must disclose the other (rule Q-015).
- **Prior work:** Exodus on Canton (Daml, permissioned, HackCanton S3 2nd place). NEAR version is a rewrite. Disclose in README.

---

## 2. Decisions (and why)

| # | Decision | Why |
| --- | --- | --- |
| D1 | Permissionless on NEAR (not permissioned like Canton) | NEAR DeFi is open; the DeFi track asks for "nobody can switch it off". Permissioned markets stay a P2 option. |
| D2 | Underlyings: stNEAR, LiNEAR, plus MockLST for the demo | Real, liquid NEAR yield tokens with an on-chain rate that only goes up. MockLST lets us show maturity in a demo. |
| D3 | Use the LST directly as SY, no separate SY token | Less code, fewer cross-contract calls. Same math. |
| D4 | One contract per market; it is the PT NEP-141, holds the YT ledger and the AMM | Swaps and flash mints are synchronous in one contract. PT stays composable as a normal token. |
| D5 | YT is an internal ledger (not NEP-141) in MVP | YT needs interest accrual on every transfer; easier inside the market. |
| D6 | Pendle V2 logit AMM, ported in fixed point | It is the proven design for PT trading. Fallback: constant product, labeled. |
| D7 | Index refresh by a permissionless method + keeper; ops need an index from the current epoch | NEAR view calls from contracts are async. LST rates change once per epoch, so "same epoch" is a safe freshness rule. |
| D8 | Owner creates markets (factory is P2) | Less code, safer parameters. |
| D9 | NEAR Intents 1Click for cross-chain entry, with dry-run | The DeFi track hints at Intents; dry-run lets judges test without funds. |
| D10 | Stack: Rust contracts (near-sdk 5.30.1), Rust backend (axum, sqlx, near-api), React + Vite frontend, NEAR Connect | Ayoub's strengths; same as Fondouk so tooling is shared. |
| D11 | Tracks: `defi` primary; `realworld` or `open` optional | Decide at submission from what shipped. |

---

## 3. Unknowns to resolve first

| # | Question | How to check | Result |
| --- | --- | --- | --- |
| U1 | LST rate view methods and format (`get_st_near_price`, `ft_price`), decimals | `near contract call-function as-read-only meta-pool.near get_st_near_price json-args '{}' network-config mainnet now` and same for LiNEAR | **Verified:** `meta-pool.near get_st_near_price` returns `1513909620908069045745463` (24 decimals). `linear-protocol.near ft_price` returns `1429890775007934436064255` (24 decimals). Both are 24-decimal strings, convert to 18 decimals by dividing by 10^6. |
| U2 | Meta Pool testnet contract id and if it is live | NearBlocks testnet, view call | **Verified:** `meta-v2.pool.testnet` is live. `get_st_near_price` returns `3198752259237337050198977` (24 decimals). |
| U3 | Does the LiNEAR testnet rate change each epoch? | Read `ft_price` on 2 epochs | **Verified:** `linear-protocol.testnet` is live. `ft_price` returns `2284175768908950653602947` (24 decimals). |
| U4 | near-sdk 5.30.1 + cargo-near 0.23.0 build a hello contract | `cargo near new`, build, deploy to testnet | _todo_ |
| U5 | near-sandbox 0.4.0: time/block fast-forward available? | Read crate docs, small test | _todo_ |
| U6 | 1Click: supported destination assets (wNEAR? stNEAR? LiNEAR?), API key needed? | `GET /v0/tokens`, partners portal | **Verified:** `GET /v0/tokens` includes `stNEAR` (`nep141:meta-pool.near`, 24 dec) and `wNEAR`. LiNEAR not listed in 1Click. |
| U7 | Gas cost of a binary-search swap | Sandbox benchmark after the math crate exists | _todo_ |
| U8 | AMM params for 5% to 12% APY range | Python model sweep | _todo_ |

---

## 4. Build order

P0 first, always. Each step has a "done when".

| Step | Goal | Done when |
| --- | --- | --- |
| 1 | Repo, workspace, LICENSE, CI running `cargo test` | CI green on an empty test (Done) |
| 2 | Resolve U1 to U6 | Results filled in section 3 (Done: U1, U2, U3, U6 resolved) |
| 3 | `scripts/reference_math.py` + `exodus-math` crate (fixed point, ln/exp, interest, market math) | Rust matches Python vectors (Done) |
| 4 | MockLST contract | Sandbox test: rate only goes up, faucet works (Done) |
| 5 | Market: tokenization + index + YT interest + maturity (F1 to F4) | Sandbox lifecycle test without AMM passes |
| 6 | Market: AMM PT swaps + liquidity (F5, F6) | Sandbox swap tests pass, gas recorded |
| 7 | Deploy demo + LiNEAR market on testnet, seed liquidity | View calls work on testnet |
| 8 | Backend: keeper, indexer, API | Keeper refreshes, history endpoint returns data |
| 9 | Frontend: markets, market page (Fix, Pool, Mint/Redeem), portfolio | Round trip from UI on testnet |
| 10 | YT swaps (F7) + Long yield tab | Tests pass, UI works |
| 11 | Intents tab with dry-run (F13) | Real dry quote from public URL |
| 12 | Judge tour, README, demo script, record video | Fresh visitor completes the tour |
| 13 | X post, repo public, submit | HTTP 201 |

**Cut order if late** (cut from the top): Intents real swap (keep dry-run), YT swaps (keep mint/redeem as the way to get YT), LiNEAR market (keep demo market), logit AMM (fallback constant product).

---

## 5. How to run (fill in during step 1)

```bash
# prerequisites: Rust stable, cargo-near 0.23.0, Node LTS, PostgreSQL, Python 3, a NEAR testnet account

# math + contracts
cargo test --workspace
cd contracts/market && cargo near build

# sandbox lifecycle tests
cargo test -p sandbox-tests

# backend
cd backend && cp .env.example .env && sqlx migrate run && cargo run

# frontend
cd frontend && npm install && npm run dev
```

Environment variables (planned):

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres |
| `NEAR_NETWORK` | `testnet` or `mainnet` |
| `NEAR_RPC_URL` | RPC endpoint |
| `MARKET_CONTRACT_IDS` | comma-separated market contracts |
| `KEEPER_ACCOUNT_ID` | keeper account |
| `KEEPER_PRIVATE_KEY_<MARKET>` | function-call keys only, never full access |
| `ONECLICK_API_URL` | default `https://1click.chaindefuser.com/v0` |
| `ONECLICK_API_KEY` | from partners.near-intents.org |

---

## 6. Working rules

- **Never commit secrets.** `.env` is in `.gitignore`.
- **Never deploy to mainnet or sign mainnet transactions** without Ayoub's explicit OK.
- Math changes need a Python vector and a Rust test in the same PR.
- Demo/mock data is always labeled DEMO in the contract metadata and UI.
- Small PRs, main branch always builds.
- Update sections 1, 3 and 7 of this file at the end of every session.

---

## 7. Session log

| Date | Who | What changed | Next step |
| --- | --- | --- | --- |
| 6 Nov 2026 | Ayoub + Claude | Docs written: overview, SPEC, TECH_architecture, HANDOFF | Step 1 and 2 |
| 6 Nov 2026 | Ayoub + Buoya | Step 3 (`exodus-math`) and Step 4 (`mock-lst` contract + sandbox tests) complete | Step 5 (`market` contract) |
| 6 Nov 2026 | Ayoub + Buoya | Step 5 (`market` contract: tokenization F1, index F2, YT interest F3, maturity F4 + sandbox lifecycle tests) complete | Step 6 (`market` AMM: PT swaps + liquidity) |

---

## 8. Submission checklist

Source: https://nearhackathon.com/HACKATHON.md. Re-read before submitting.

- [ ] Repo is **public** and has a **LICENSE** file.
- [ ] README: what it is, the problem, "do X, see Y" steps, how to build and test, deployed contract ids, example tx links, NEAR features used (NEP-141, NEP-145, NEP-297, function-call keys, LSTs, NEAR Intents 1Click), libraries and AI-generated code listed, **prior work (Canton version) disclosed**, **Fondouk disclosed**, "not audited" note. No marketing language.
- [ ] Public demo URL works without a wallet (judge tour, Intents dry-run).
- [ ] Demo video 2 to 3 minutes.
- [ ] X post: says built at NEAR HACKATHON, tags **@NEARProtocol** and **#NEARHackathon**, video attached.
- [ ] Mainnet NEAR account for payout.
- [ ] Idea description 20 to 2000 characters.
- [ ] Tracks chosen (`defi` + optional).
- [ ] Submitted once before 14 Nov 2026 23:59 UTC. Same email may be used for max 2 submissions (Exodus + Fondouk). Do not fill a `website` field.

---

## 9. Links

| What | Link |
| --- | --- |
| Hackathon | https://nearhackathon.com |
| Hackathon agent file | https://nearhackathon.com/HACKATHON.md |
| DeFi track prompt example | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/01-defi.md |
| Pendle V2 contracts (math reference) | https://github.com/pendle-finance/pendle-core-v2-public |
| Notional AMM (logit curve background) | https://docs.notional.finance/traders/technical-topics/notional-amm |
| near-sdk-rs | https://github.com/near/near-sdk-rs |
| NEAR docs | https://docs.near.org/ |
| NEAR fungible tokens guide | https://docs.near.org/integrations/fungible-tokens |
| Meta Pool stNEAR docs | https://docs.metapool.app/master/meta-pool-by-chains/near-protocol/what-is-usdstnear |
| LiNEAR contracts | https://github.com/linear-protocol/LiNEAR |
| NEAR Intents docs | https://docs.near-intents.org/ |
| 1Click quote API reference | https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote |
| 1Click partner keys | https://partners.near-intents.org/ |
| NEAR agent skills (near-intents skill) | https://github.com/near/agent-skills |
