# Testnet Login & Deployment Guide

This guide walks through authenticating with `near-cli-rs` and deploying the Exodus contracts to NEAR Testnet.

---

## 1. Authentication (Log In)

The root account used for Exodus on Testnet is:
```text
fond-buoya.testnet
```

### Option A: Web Wallet Browser Auth (Recommended)
Run in PowerShell:
```powershell
near account import-account using-web-wallet fond-buoya.testnet network-config testnet save-to-keychain
```
1. Open the URL provided by the CLI (e.g. `https://testnet.mynearwallet.com/login/?...`).
2. Click **Approve / Connect** to authorize the key on-chain.

### Option B: Seed Phrase
```powershell
near account import-account using-seed-phrase fond-buoya.testnet network-config testnet
```

---

## 2. Verification

Check that your CLI is authorized and has sufficient testnet balance:
```powershell
near account view-account-summary fond-buoya.testnet network-config testnet now
```

> **Requirement:** At least ~25–30 testnet NEAR to fund sub-account creation and contract storage.
> Free testnet faucets:
> - https://faucet.testnet.near.org/
> - https://faucet.triangleplatform.com/near/testnet

---

## 3. Deployment & Seeding

Run the automated deployment script from the project root:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\deploy_testnet.ps1
```

### Deployed Sub-Accounts:
- **MockLST Contract:** `mock-lst.fond-buoya.testnet`
- **Demo Market Contract:** `demo-market.fond-buoya.testnet` (3-day expiry)
- **LiNEAR Market Contract:** `linear-market.fond-buoya.testnet` (31 March 2027 expiry)

The script automatically:
1. Creates sub-accounts.
2. Deploys `mock_lst.wasm` and `market.wasm`.
3. Initializes the contracts.
4. Registers NEP-145 storage.
5. Claims 100 MockLST from the faucet.
6. Mints 50 PT + 50 YT (`mint_py`).
7. Seeds the AMM pool with 25 PT + 25 MockLST (`add_liquidity`).
8. Verifies and prints live view calls (`get_market`, `get_pool`).

---

## 4. Yield Progression Demo (Simulate Epochs)

Whenever you want to demonstrate interest accrual for demo videos or judges:
```powershell
.\scripts\demo_advance.ps1 -IncreasePercent 1.0
```
This increases MockLST exchange rate by +1%, calls `refresh_index()`, and displays the newly accrued YT yield!
