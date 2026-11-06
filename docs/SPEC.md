# Exodus on NEAR: Product Specification

Version 0.1, 6 Nov 2026. Target: NEAR HACKATHON (deadline 14 Nov 2026, 23:59 UTC). Read `overview.md` first.

---

## 1. Goals and non-goals

### Goals
- G1. A user can lock a fixed yield on a NEAR liquid staking token (LST) in one transaction, and see exactly how much NEAR they get at maturity.
- G2. A user can split an LST into PT + YT, merge them back, trade both, and provide liquidity.
- G3. Every market shows its **implied APY** (from the AMM) next to the **underlying APY** (from the LST rate).
- G4. The full lifecycle (mint, trade, accrue, mature, redeem) can be shown live in the demo, using a short-maturity demo market.
- G5. A user on another chain can enter through NEAR Intents (1Click), with a dry-run mode that needs no funds.
- G6. The protocol is non-custodial: no admin key can take user funds. The keeper key cannot move funds.
- G7. An AI judge can clone the repo, run the tests, deploy to sandbox or testnet, and check every feature from the README.

### Non-goals (hackathon)
- No governance token, no incentives, no vePENDLE-like system.
- No leverage or lending of PT/YT inside Exodus.
- No permissionless market creation (owner creates markets; factory is P2).
- No permissioned/KYC markets (P2, they were the Canton version).
- No mobile app. Desktop first, must not break on mobile.

---

## 2. Users

| Persona | Wants | Main features |
| --- | --- | --- |
| Fixed-yield saver (person, DAO, treasury) | Know exactly what they earn | Buy PT, portfolio, redeem |
| Yield trader | Bet on staking APY going up or down | Buy/sell YT, buy/sell PT |
| Liquidity provider | Earn fees + yield | Add/remove liquidity |
| Cross-chain user | Fixed NEAR yield without learning NEAR | Intents entry tab |
| Judge (human or AI) | Understand and verify fast | Judge tour, dry-run, README "do X, see Y" |

---

## 3. Core concepts

| Concept | Definition |
| --- | --- |
| **Underlying asset** | NEAR. All values (PT, YT, APY) are measured in NEAR. |
| **LST / SY** | The yield-bearing token deposited (stNEAR, LiNEAR, MockLST). Pendle wraps it in an "SY" token. Exodus uses the LST directly and calls it SY in code and math. |
| **Index (I)** | NEAR value of 1 LST, read from the LST contract. Only goes up. Exodus stores `py_index = max(stored, latest)`, so a temporary drop never hurts PT. |
| **Market** | One LST + one maturity date. One contract per market. |
| **Maturity (expiry)** | Timestamp after which PT can be redeemed and YT stops earning. |
| **PT** | Redeems for 1 NEAR worth of LST at maturity. NEP-141 token (the market contract itself is the PT token). |
| **YT** | Gets all yield of 1 NEAR principal until maturity. Internal balance in the market contract for MVP. |
| **Implied APY** | The fixed rate the market prices into PT. `implied_apy = exp(last_ln_implied_rate) - 1`. |
| **Underlying APY** | Real recent yield of the LST: `(I_now / I_7d_ago)^(365 / 7) - 1`. |
| **LP share** | Internal share of the AMM pool (PT + SY). Not transferable in MVP. |
| **Keeper** | Bot that calls the permissionless `refresh_index` every epoch. Anyone else can call it too. |

---

## 4. Core math

All on-chain math uses **fixed point**, no floats. Index and rates use 18 decimals (`1e18 = 1.0`). Token amounts keep their own decimals (stNEAR, LiNEAR and NEAR use 24). `ln` and `exp` use a port of Balancer `LogExpMath` (the one Pendle uses).

Reference implementation to port: Pendle `MarketMathCore.sol` and `PendleYieldToken.sol` in https://github.com/pendle-finance/pendle-core-v2-public. A Python reference model in `scripts/reference_math.py` must produce test vectors for the Rust code.

### 4.1 Tokenization

```
mint:   sy_in            -> pt_out = yt_out = sy_in * I
redeem (any time):  a PT + a YT -> sy_out = a / I
redeem PT after maturity:  a PT -> sy_out = a / I_current
```

### 4.2 YT interest

Per user, store `user_index` (index at last accrual) and `accrued_sy`.

```
interest_sy = yt_balance * (I_new - user_index) / (user_index * I_new)
fee_sy      = interest_sy * interest_fee_bps / 10_000        -> treasury
accrued_sy += interest_sy - fee_sy
user_index  = I_new
```

- Accrual runs **before every change of a user's YT balance** (mint, redeem, swap, transfer) and on `claim_interest`.
- After maturity, `I_new` is capped at `I_maturity` (the first index stored at or after expiry). YT earns nothing after maturity.
- Yield on SY that belongs to matured but not yet redeemed PT goes to the treasury (same as Pendle).

Check: 130 YT, index 1.30 -> 1.3016: `130 * 0.0016 / (1.30 * 1.3016) = 0.12293 stNEAR = 0.16 NEAR`.

### 4.3 AMM (Pendle V2 logit curve)

State: `total_pt`, `total_sy`, `total_lp`, `last_ln_implied_rate`, `scalar_root`, `initial_anchor`, `ln_fee_rate_root`, `reserve_fee_bps`, `expiry`.

```
tau          = expiry - now                      (seconds, must be > 0)
rate_scalar  = scalar_root * YEAR / tau          (YEAR = 365 days)
total_asset  = total_sy * I                      (in NEAR)
p            = total_pt / (total_pt + total_asset)        must be <= 0.96
ER(p)        = ln(p / (1 - p)) / rate_scalar + rate_anchor   (PT per 1 NEAR, so PT price in NEAR = 1 / ER), ER >= 1

At the start of each trade:
  ER_last     = exp(last_ln_implied_rate * tau / YEAR)
  rate_anchor = ER_last - ln(p0 / (1 - p0)) / rate_scalar     (p0 = proportion before trade)

Trade with d = net PT to user (d > 0 buy PT, d < 0 sell PT):
  p_new                = (total_pt - d) / (total_pt + total_asset)
  pre_fee_ER           = ER(p_new)
  pre_fee_asset_to_user = -d / pre_fee_ER
  fee_rate             = exp(ln_fee_rate_root * tau / YEAR)
  if d > 0: require pre_fee_ER / fee_rate >= 1
            fee = pre_fee_asset_to_user * (1 - fee_rate)
  else:     fee = -(pre_fee_asset_to_user * (1 - fee_rate) / fee_rate)
  asset_to_user    = pre_fee_asset_to_user - fee
  asset_to_reserve = fee * reserve_fee_bps / 10_000
  total_pt -= d
  total_sy -= (asset_to_user + asset_to_reserve) / I
  last_ln_implied_rate = ln(ER(new p, same rate_anchor)) * YEAR / tau
```

Rules:
- Exact-PT trades use the formula directly. Exact-SY-in trades (for example "pay 10 LST, get max PT") use an **on-chain bounded binary search** (max 64 iterations) with an optional off-chain hint from the frontend.
- Every trade has a `min_out` (slippage). Fails if not met.
- No trading after expiry. After expiry LPs can only remove liquidity.

Check: `scalar_root = 10`, 90 days left, target implied APY 8.5%: `rate_scalar = 40.56`, `ER = 1.0203`, PT price = 0.9801 NEAR. At p = 0.5 the anchor equals ER.

### 4.4 Liquidity
- First deposit: `lp = sqrt(pt * sy) - MINIMUM_LIQUIDITY`, the minimum (1000 units) is locked forever. `last_ln_implied_rate` is set from `initial_anchor`.
- Later deposits: proportional to current reserves; the extra side is returned.
- Remove: pro-rata PT + SY.

### 4.5 YT trades (flash mint inside one contract)
- **Buy YT with SY:** user pays `s` SY. Contract mints `y` PT + `y` YT using `s + borrowed` SY, sells the `y` PT to the AMM for `borrowed` SY, gives the user `y` YT. Solve `y` with binary search.
- **Sell YT for SY:** user gives `y` YT. Contract buys `y` PT from the AMM with SY, merges `y` PT + `y` YT into `y / I` SY, pays the AMM, user gets the rest.
- All steps happen in one function call, so there is no partial state.

---

## 5. Features and requirements

Priority: **P0** must ship. **P1** should ship. **P2** only if time allows.

### F1. Market contract: tokenization (P0)
- F1.1 Deposit LST with `ft_transfer_call` and `msg = {"action":"mint_py"}` to receive PT + YT.
- F1.2 `redeem_py(amount)` burns equal PT + YT, sends LST back.
- F1.3 PT is a NEP-141 token implemented by the market contract (with NEP-145 storage management and NEP-148 metadata, name like `PT LiNEAR 31MAR2027`, 24 decimals).
- F1.4 YT is an internal ledger with `yt_balance_of`, `yt_transfer` (accrues both sides first).
- Acceptance: mint 100 LST at index 1.30 gives 130 PT + 130 YT; redeem 130 PT + 130 YT at the same index gives back exactly 100 LST (rounding always in favor of the contract, max 1 yocto loss).

### F2. Index and keeper (P0)
- F2.1 `refresh_index()` is public. It calls the LST view method, and in the callback stores `py_index = max(old, new)`, `index_updated_at`, `index_epoch = env::epoch_height()`.
- F2.2 State-changing user methods require `index_epoch == current epoch`. If stale, they fail with error `INDEX_STALE: call refresh_index`. (LST rates change once per epoch, about 12 hours, so this is safe.)
- F2.3 The keeper calls `refresh_index` at least every 30 minutes and right after a new epoch starts, using a **function-call key** limited to `refresh_index`.
- F2.4 At the first refresh at or after expiry, the contract stores `index_at_maturity` and emits `market_matured`.
- Acceptance: with a stale index, `mint_py` fails with `INDEX_STALE`; after `refresh_index` it succeeds.

### F3. YT interest (P0)
- F3.1 Interest formula of section 4.2, accrual before every YT balance change.
- F3.2 `claim_interest()` sends accrued LST to the user.
- F3.3 Interest fee (default 300 bps = 3%) goes to the treasury account.
- Acceptance: MockLST rate bumped from 1.30 to 1.3016, holder of 130 YT can claim 0.12293 LST minus 3% fee (0.11924 LST), within 1e-9 relative error.

### F4. Maturity and redemption (P0)
- F4.1 After expiry, `redeem_pt(amount)` returns `amount / I_current` LST.
- F4.2 After expiry, AMM trades are blocked, YT interest stops at `index_at_maturity`.
- F4.3 Post-maturity yield of un-redeemed PT is claimable by treasury with `collect_treasury()`.
- Acceptance: on the demo market, after expiry 100 PT redeem for exactly 100 NEAR worth of MockLST.

### F5. AMM: PT swaps (P0)
- F5.1 Buy PT with exact LST in (`ft_transfer_call`, `msg = {"action":"swap_exact_sy_for_pt","min_pt_out":"..."}`).
- F5.2 Sell exact PT for LST: `swap_exact_pt_for_sy(pt_in, min_sy_out)`.
- F5.3 View previews for both: `preview_swap_exact_sy_for_pt`, `preview_swap_exact_pt_for_sy`, returning amount out, fee, new implied APY, price impact.
- Acceptance: preview and execution match exactly in sandbox tests; a buy followed by a sell of the same PT loses only the fee (test).

### F6. Liquidity (P0)
- F6.1 Add: `ft_transfer_call` with LST and `msg = {"action":"add_liquidity","pt_desired":"...","min_lp_out":"..."}`. The PT side is taken from the caller's internal PT balance.
- F6.2 Remove: `remove_liquidity(lp, min_pt_out, min_sy_out)`.
- F6.3 Owner seeds the first liquidity at market creation (script).
- Acceptance: add then remove in the same block returns the deposit minus at most rounding.

### F7. AMM: YT swaps (P1)
- F7.1 Buy YT with exact LST (`msg = {"action":"swap_exact_sy_for_yt","min_yt_out":"..."}`) by flash mint (section 4.5).
- F7.2 Sell exact YT: `swap_exact_yt_for_sy(yt_in, min_sy_out)`.
- F7.3 Previews for both.
- Acceptance: buy YT then sell YT immediately loses only fees and price impact; contract SY balance is never below the sum of user claims (invariant test).

### F8. Demo market with MockLST (P0)
- F8.1 `mock-lst` contract: NEP-141 with a rate (`get_rate`) that an admin can increase only (never decrease). Labeled "DEMO" everywhere.
- F8.2 Demo market maturity is short (default 3 days after deploy, configurable), so judges can see redemption.
- F8.3 A `scripts/demo-advance` command bumps the MockLST rate to simulate yield for the demo video.
- Acceptance: the README demo shows mint, trade, rate bump, claim, maturity, redeem on testnet with tx links.

### F9. Real LST markets (P0 testnet, P1 mainnet)
- F9.1 LiNEAR testnet market (`linear-protocol.testnet`, exists since Apr 2025 per NearBlocks testnet).
- F9.2 stNEAR market on testnet if Meta Pool has a working testnet contract (U2), else mainnet.
- F9.3 Mainnet market only with Ayoub's explicit OK, with a deposit cap (for example 50 NEAR total).
- Acceptance: at least one market whose index comes from a real LST contract.

### F10. Events (P0)
- NEP-297, `standard: "exodus"`, `version: "1.0.0"`. Events: `mint_py`, `redeem_py`, `redeem_pt`, `claim_interest`, `swap` (with `kind`: pt_buy, pt_sell, yt_buy, yt_sell), `add_liquidity`, `remove_liquidity`, `index_updated`, `market_matured`, `paused`, `unpaused`.
- Acceptance: indexer can rebuild all user positions from events alone (test against contract views).

### F11. Indexer and API (P0)
- F11.1 Stores market snapshots every minute: index, implied APY, underlying APY, reserves, TVL in NEAR.
- F11.2 Stores all events.
- F11.3 REST API (section in `TECH_architecture.md`).
- Acceptance: chart endpoint returns at least 24h of implied APY points for each live market.

### F12. Web app (P0)
- F12.1 Markets list: asset, maturity, days left, implied APY, underlying APY, TVL, "DEMO" badge where needed.
- F12.2 Market page tabs: **Fix yield** (buy/sell PT), **Long yield** (buy/sell YT, P1), **Pool**, **Mint / Redeem**.
- F12.3 Every trade form shows: amount out, fee, price impact, implied APY after trade, and a plain sentence like "You will receive 102.04 NEAR worth of LiNEAR on 31 Mar 2027".
- F12.4 Long yield form shows the **break-even underlying APY** (the YT pays off only if real APY stays above the implied APY).
- F12.5 Portfolio: PT, YT, LP, claimable interest, value at maturity, buttons for claim and redeem.
- F12.6 Chart: implied APY vs underlying APY over time.
- F12.7 Every tx result shows an explorer link.
- Acceptance: a full round trip (mint, buy PT, add LP, claim, redeem) is possible from the UI on testnet.

### F13. NEAR Intents entry: "Fixed yield from any chain" (P1)
- F13.1 Tab "From another chain": user picks origin chain and asset (from `GET /v0/tokens`), amount, and their NEAR account.
- F13.2 Backend proxies the 1Click API (keeps the API key server-side). Dry quote first, then real quote with deposit address. Destination: wNEAR (or the LST directly if 1Click supports it, see U6) to the user's NEAR account.
- F13.3 UI tracks status until a terminal state, and clearly shows `SUCCESS`, `REFUNDED`, `FAILED` and where the funds are at each step.
- F13.4 After `SUCCESS`, UI guides the next NEAR transactions: unwrap wNEAR, stake into the LST, buy PT.
- F13.5 **Dry-run mode** (default for visitors without a wallet): real quotes, no deposit, no funds needed.
- Acceptance: dry-run returns a real quote for USDC on Arbitrum to wNEAR; one real tiny mainnet swap is done once with the tx links in the README.

### F14. Admin and safety (P0)
- F14.1 Owner can `pause` / `unpause` new mints, swaps and liquidity adds. **Redeem, remove liquidity and claim always work**, even when paused.
- F14.2 Owner can set treasury and fees within hard bounds (interest fee max 1000 bps, reserve fee max 8000 bps).
- F14.3 Owner can set a TVL cap per market.
- F14.4 No method lets the owner or keeper move user balances.
- F14.5 Contract version string in a view method.
- Acceptance: tests show that redeem and claim work while paused, and that non-owners cannot call admin methods.

### F15. Judge mode (P0)
- F15.1 Without a wallet: browse markets, see charts, use previews, run Intents dry-run.
- F15.2 "Judge tour": 5-step overlay (what PT/YT are, fixed yield calculator, AMM preview, portfolio of a demo account, Intents dry-run).
- Acceptance: a fresh visitor finishes the tour without a wallet.

### F16. Later (P2)
- Market factory (permissionless creation with fixed parameter ranges).
- YT as NEP-141.
- Permissioned market mode: allowlist of accounts (institutional, like the Canton version).
- PT oracle (TWAP of implied rate) for lending protocols.

---

## 6. Contract interface summary (market contract)

| Method | Who | Payable | Notes |
| --- | --- | --- | --- |
| `new(config)` | deployer | no | init |
| `ft_on_transfer(sender_id, amount, msg)` | LST contract | no | actions: `mint_py`, `swap_exact_sy_for_pt`, `swap_exact_sy_for_yt`, `add_liquidity` |
| `redeem_py(amount)` | user | 1 yocto | |
| `redeem_pt(amount)` | user | 1 yocto | after expiry only |
| `claim_interest()` | user | 1 yocto | |
| `swap_exact_pt_for_sy(pt_in, min_sy_out)` | user | 1 yocto | |
| `swap_exact_yt_for_sy(yt_in, min_sy_out)` | user | 1 yocto | P1 |
| `remove_liquidity(lp, min_pt_out, min_sy_out)` | user | 1 yocto | |
| `yt_transfer(receiver_id, amount)` | user | 1 yocto | |
| `refresh_index()` | anyone | no | keeper uses a function-call key |
| `pause()`, `unpause()`, `set_fees()`, `set_treasury()`, `set_cap()`, `collect_treasury()` | owner | 1 yocto | |
| NEP-141 / NEP-145 / NEP-148 methods | standard | standard | PT token |
| Views: `get_market()`, `get_user(account_id)`, `yt_balance_of`, `preview_*`, `get_implied_apy()`, `version()` | anyone | view | |

1 yoctoNEAR on user methods is the NEAR standard to force a full-access key signature (wallet confirmation).

---

## 7. Honesty rules for data shown

- Demo markets (MockLST) always show a "DEMO, simulated yield" badge.
- Implied APY and underlying APY are always shown side by side and labeled.
- The UI never says "guaranteed". It says "fixed if held to maturity" and shows a short risk note (smart contract risk, LST risk, unaudited hackathon code).
- Testnet and mainnet markets are clearly labeled.

---

## 8. Success criteria for the demo

- All P0 acceptance tests pass in CI (`cargo test` for contracts and backend).
- Testnet deployment with at least 2 markets (demo + one real LST).
- Full lifecycle shown on the demo market with tx links in the README.
- Intents dry-run works from the public URL without a wallet.
- AI judge can follow README steps: build, test, run locally, open public demo.

---

## 9. Open questions

| # | Question | How to answer | Deadline |
| --- | --- | --- | --- |
| Q1 | Exact view methods for the LST rate. Believed: Meta Pool `get_st_near_price`, LiNEAR `ft_price`. Return format and decimals? | `near contract call-function as-read-only` on mainnet and testnet | Day 1 |
| Q2 | Does Meta Pool have a live testnet contract (believed `meta-v2.pool.testnet`)? | NearBlocks testnet + view call | Day 1 |
| Q3 | Default AMM params per market (`scalar_root`, `initial_anchor`, `ln_fee_rate_root`) | Use Pendle LST market params as a start, tune in the Python model for the expected APY range 5% to 12% | Day 2 |
| Q4 | Does 1Click support stNEAR or LiNEAR as destination asset, or only wNEAR? | `GET /v0/tokens` | Day 3 |
| Q5 | 1Click API key needed for quotes? | partners.near-intents.org | Day 3 |
| Q6 | Mainnet market: yes or no | Ayoub decides | Day 6 |
| Q7 | Final track list | Decide at submission | Last day |
