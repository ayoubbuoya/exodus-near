# Exodus on NEAR: 2.5-Minute Demo Video Recording Script

> **Target Duration:** 2 minutes 15 seconds – 2 minutes 45 seconds  
> **Speaker:** Ayoub  
> **Screen Setup:** Browser showing Exodus Frontend ([http://localhost:5173](http://localhost:5173)), terminal window ready with PowerShell for `demo_advance.ps1`, testnet wallet connected.

---

## Video Breakdown

| Scene | Timestamp | Screen Focus | Action on Screen | Voiceover / Narration |
| :---: | :---: | :--- | :--- | :--- |
| **1** | `0:00 - 0:25` | Homepage & Stats Bar | Hover over Market Stats bar and APY Chart | *"Hello NEAR Hackathon judges! Staking yields on NEAR LSTs fluctuate between 8% and 12% APY. Conservative savers and DAOs can't forecast treasury revenues, while yield traders lack capital-efficient tools to speculate on rates. Welcome to **Exodus**, a permissionless fixed-yield and yield trading protocol on NEAR powered by an on-chain Pendle V2 Logit Curve AMM."* |
| **2** | `0:25 - 0:55` | **Fix Yield Tab** | Select PT MockLST or LiNEAR. Enter 10 LST. Click **"Lock Fixed Yield"**. Show wallet confirmation. | *"Exodus splits yield-bearing tokens into Principal Tokens (PT) and Yield Tokens (YT) inside a single autonomous contract. In the Fix Yield tab, a user buys PT at a discount—for example, locking an 8.5% fixed APY. Regardless of network rate drops, at maturity on March 31, 2027, 1 PT redeems for exactly 1 NEAR worth of LST."* |
| **3** | `0:55 - 1:35` | Terminal & **Portfolio Tab** | Switch to PowerShell terminal, run `.\scripts\demo_advance.ps1 -IncreasePercent 1.0`. Switch back to browser. Click Refresh, show newly accrued yield, click **"Claim All Interest"**. | *"Now let's show real yield accrual. For this hackathon demo, we built an on-chain MockLST contract. Watch this: I'll run our demo advance script to simulate a +1% staking reward jump on testnet. Instantly, our market index refreshes, and in the Portfolio tab, you see claimable YT interest accrued. With one click, I claim my newly generated yield into my wallet!"* |
| **4** | `1:35 - 2:10` | **Cross-Chain (NEAR Intents) Tab** | Click the **Cross-Chain** tab. Select **Arbitrum USDC**. Type `100`. Show live route cards. | *"Next, what if you don't even have a NEAR wallet? Using NEAR Intents 1Click, users from Arbitrum, Ethereum, Base, or Solana can enter in seconds. Our interactive dry-run simulator queries real-time liquidity: depositing 100 USDC on Arbitrum converts to ~27.9 NEAR and locks 28.4 PT in under 25 seconds—delivering guaranteed fixed returns with zero custodial risk."* |
| **5** | `2:10 - 2:30` | **Judge Tour** & Wrap-up | Click the **"⚡ Judge Tour"** button in the navbar. Step through 2 slides. Show GitHub repo. | *"Judges evaluating without a wallet can take our interactive 60-second in-app tour. All our smart contracts, pure Rust math engine with 18 decimals, and sandbox tests are open source on GitHub. Thank you for watching, and welcome to the future of fixed yield on NEAR!"* |

---

## Pre-Recording Checklist

- [ ] Browser zoom set to 100% or 110% for crisp readability.
- [ ] Wallet connected to `fond-buoya.testnet` with sufficient testnet NEAR for gas.
- [ ] Dev server running (`npm run dev` in `frontend/`).
- [ ] Backend running or public fallback active.
- [ ] Terminal opened to project root with `.\scripts\demo_advance.ps1` typed and ready to execute.
