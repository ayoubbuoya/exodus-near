# Exodus on NEAR

**Fixed yield and yield trading for NEAR liquid staking tokens.**

Exodus is a Pendle-style yield tokenization protocol on NEAR. It takes a yield-bearing token (stNEAR from Meta Pool, LiNEAR from LiNEAR Protocol) and splits it into two tokens with a maturity date:

- **PT (Principal Token):** worth exactly 1 NEAR at maturity. Bought at a discount today, it gives a **fixed yield**.
- **YT (Yield Token):** receives all the staking yield of 1 NEAR of principal until maturity. It is a **leveraged, variable yield** position.

A built-in AMM (Pendle V2 style, logit curve that tightens as maturity gets closer) lets users trade PT and YT against the underlying token. The market price of PT is the market's **fixed interest rate** for NEAR staking, something NEAR DeFi does not have today.

On top of that, Exodus uses **NEAR Intents (1Click API)** so a user can pay with USDC or another asset from another chain and end up holding fixed-yield PT on NEAR.

---

## 1. The hackathon

| Item | Detail |
| --- | --- |
| Event | NEAR HACKATHON |
| Website | https://nearhackathon.com |
| Agent instructions file | https://nearhackathon.com/HACKATHON.md (re-read before submitting, rules can change) |
| Starts | 1 Nov 2026, 00:00 UTC. Code written from 19 Oct 2026 counts (rule Q-001). |
| Development ends (deadline) | 14 Nov 2026, 23:59 UTC |
| Judging | 16 to 18 Nov 2026 |
| Results announced by | 18 Nov 2026, 23:59 UTC |
| Submission | https://nearhackathon.com/#apply or `POST https://nearhackathon.com/api/applications` |
| Prize pool | $250K in NEAR: 1 grand prize $55K, then $10K / $3K / $2K for 1st / 2nd / 3rd in each of 13 tracks |
| DeFi track example prompt | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/01-defi.md |

### Judging
There is no formal rubric. Claude Code and Codex screen every repo for **reproducibility, feature verification**, and write a report with a preliminary score. Human judges decide. So the repo must build, run and be testable by an AI agent following the README.

Judges listed on the site: Illia Polosukhin, Eddy Lazzarin, Mert Mumtaz, Avichal Garg, Kain Warwick, Haseeb Qureshi, Stepan Gershuni, plus Claude Code and Codex as AI screeners.

### Submission requirements (from HACKATHON.md)
1. **Public repository** with a **LICENSE** file. Each repo can be submitted only once.
2. **Public demo post on X** that says it was built at NEAR HACKATHON, tags **@NEARProtocol** and **#NEARHackathon**, with a demo video or screenshots (screenshots alone are not enough if judges cannot open the demo).
3. **Mainnet NEAR account** for the prize payout.
4. **Idea description**, 20 to 2000 characters: problem, product, how NEAR fits.
5. Team details: project name, lead name, email, team size, tracks.

### Important rules for this project
- **Two projects by one person is allowed.** One person can submit up to 2 independent projects, if **each README discloses the other** (rule Q-015). Ayoub is also building **Fondouk** (AI town of DeFi agents). Exodus README must mention Fondouk and Fondouk README must mention Exodus. This uses the full quota: no third project.
- **Max 2 submissions per email.** Same reason, both are used.
- **Existing projects:** only new work in the window is judged, and old work must be disclosed (Q-002, Q-004). See section 7.
- **Libraries and AI-generated code** are allowed if listed in the README (Q-005).
- **Testnet-only projects are eligible**, except where the integration is mainnet-only (Q-010). **NEAR Intents has no testnet**: use mainnet with separate dev accounts and tiny amounts (Q-007).

### Tracks we submit to

| Track id | Track | Fit |
| --- | --- | --- |
| `defi` | Unstoppable DeFi | **Primary.** Fixed-rate market, AMM, vault-like tokenization, non-custodial, settles cross-chain entry through NEAR Intents. |
| `realworld` | Real-World Money | Optional. Fixed yield on stable value is the base of real treasury products. Only select if a stablecoin market ships. |
| `open` | Open Innovation | Fallback if the final scope fits nowhere else. |

Final list decided at submission time, based on what actually shipped.

---

## 2. The problem

1. **No fixed rate on NEAR.** NEAR stakers earn a variable APY (it moves with validator rewards, protocol inflation and fees). There is no on-chain way to lock today's rate for 3 or 6 months. Treasuries, DAOs and careful users cannot plan.
2. **No way to trade or hedge yield.** If you think NEAR staking yield will go up, the only way to bet on it is to buy and stake the whole asset. If you think it will go down, you cannot hedge at all.
3. **No market price for "the NEAR interest rate".** Without a market, nobody knows what rate the market expects. Other chains have this through Pendle. NEAR does not.
4. **Getting into NEAR DeFi from another chain is many steps.** Bridge, swap, stake, then use DeFi.

## 3. The solution

| Need | Exodus feature |
| --- | --- |
| Lock a fixed rate | Buy **PT** at a discount, hold to maturity, redeem 1 PT for 1 NEAR worth of the LST. |
| Bet on higher yield | Buy **YT**. Small price, receives the full yield of the principal. |
| Hedge yield | Sell YT you minted, keep PT. |
| Earn as a market maker | Provide PT + LST liquidity to the AMM. Earn swap fees + the LST staking yield + PT fixed yield. |
| Know the market rate | Every market shows **implied APY** (fixed rate from PT price) next to **underlying APY** (real LST yield). |
| Come from any chain | "Fixed yield from anywhere": pay USDC on Arbitrum, Solana, etc. through NEAR Intents 1Click, end with PT on NEAR. |

### Worked example (numbers checked)
- 1 stNEAR = 1.30 NEAR today (the LST exchange rate, called the **index**).
- Mint: deposit 100 stNEAR. Value = 100 x 1.30 = 130 NEAR. You get **130 PT + 130 YT**.
- Fixed yield: PT trades at 0.98 NEAR with 90 days to maturity. Implied APY = (1 / 0.98)^(365 / 90) - 1 = **8.54%**. Buying with 100 NEAR worth gives 100 / 0.98 = 102.04 PT, so +2.04 NEAR at maturity, no matter what happens to staking yield.
- Yield: index goes from 1.30 to 1.3016 in one week. 130 YT earn 130 x (1.3016 - 1.30) / 1.30 = **0.16 NEAR** of interest (paid as 0.1229 stNEAR). Underlying APY over that week = (1.3016 / 1.30)^(365 / 7) - 1 = 6.62%.

## 4. User journey

1. Open the app. Without a wallet you can browse all markets and run the **judge tour**.
2. Connect a NEAR wallet (NEAR Connect).
3. Pick a market, for example `LiNEAR, maturity 31 Mar 2027`.
4. Choose a goal:
   - **Fix my yield:** pay LiNEAR, receive PT. The UI shows "you will get X NEAR on DATE".
   - **Long yield:** pay LiNEAR, receive YT. The UI shows the break-even underlying APY.
   - **Provide liquidity:** deposit LiNEAR (+ PT), receive LP shares.
   - **Mint / Redeem:** split LiNEAR into PT + YT, or merge them back any time.
5. Portfolio page shows PT, YT, LP, claimable interest, value at maturity.
6. After maturity, redeem PT for the LST. Claim YT interest any time.
7. Optional: **"From another chain"** tab. Pick USDC on Arbitrum (for example), get a 1Click quote, send to the deposit address, watch the status, then finish the stake + buy PT steps on NEAR.

## 5. Why NEAR

- **Native liquid staking tokens with an on-chain exchange rate** (Meta Pool stNEAR, LiNEAR). Their rate only goes up each epoch (~12 hours), which is exactly what yield tokenization needs.
- **NEP-141 + `ft_transfer_call`** gives one-transaction deposits into the protocol.
- **NEP-297 events** make indexing trades and rates simple.
- **NEAR Intents (1Click)** brings users and liquidity from other chains without a bridge UI.
- **Account model and access keys**: the keeper bot only holds a function-call key limited to `refresh_index`, it cannot move funds.
- Fixed-rate PT is a building block for other NEAR apps: lending markets can accept PT as collateral, DAOs can park treasury at a fixed rate, and AI agents (for example Fondouk characters) can buy fixed yield.

## 6. Scope

**MVP (hackathon):**
- Market contract: tokenize (mint PT + YT), redeem, YT interest accrual and claim, PT redemption after maturity.
- Pendle V2 style AMM in the same contract: PT/LST swaps, YT swaps through flash mint, add and remove liquidity.
- 3 markets: MockLST demo market with short maturity (full lifecycle in the demo), LiNEAR testnet market, and optionally a tiny-capped stNEAR mainnet market.
- Keeper bot that refreshes the index every epoch.
- Indexer + API for implied APY, underlying APY, TVL and trade history.
- Web app: markets list, market page (Fix, Long yield, Pool, Mint/Redeem), portfolio, judge tour.
- NEAR Intents 1Click entry flow with dry-run mode.

**Next steps (pitch only, build if time allows):**
- Permissionless market factory.
- YT as its own NEP-141 token.
- Permissioned "institutional" markets with an allowlist (the original Canton design).
- PT as collateral on Rhea Lend.
- Stablecoin yield markets (when NEAR has a yield-bearing stablecoin with an on-chain rate).
- Contract-owned cross-chain accounts with Chain Signatures.

## 7. Prior work disclosure

Exodus first existed as a **permissioned Pendle-style protocol on Canton** (Daml), built by Ayoub's team for HackCanton Season 3, where it won 2nd place (Oct 2026). Ayoub did the backend and smart contracts.

The NEAR version is a **new implementation**: new language (Rust, near-sdk), new contracts, new AMM code, new backend and frontend, permissionless design. No code is copied from the Canton version. Only the idea, the name and the protocol design knowledge carry over. The README must say this clearly.

## 8. Team

- **Ayoub:** lead, Rust smart contracts, backend.
- Others: to be added.

## 9. Related documents

- `SPEC.md`: product specification, features, acceptance criteria, math.
- `TECH_architecture.md`: architecture, stack with versions, contracts, data model, tests.
- `HANDOFF.md`: current state, decisions, unknowns, plan, how to contribute.
