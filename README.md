# Exodus on NEAR

> **Fixed yield and yield trading on NEAR Protocol.**  
> Tokenize yield-bearing assets (stNEAR, LiNEAR) into Principal Tokens (PT) for guaranteed fixed yield and Yield Tokens (YT) for leveraged yield speculation, powered by an on-chain Logit AMM.

---

## 1. Disclosures & Attribution

- **Hackathon Entry:** Built for the **NEAR HACKATHON** (Deadline: 14 Nov 2026). Primary track: **DeFi**.
- **Sister Project Disclosure (Rule Q-015):** Created by the same author as **Fondouk** (AI town of autonomous DeFi agents on NEAR). Both projects are developed concurrently for this hackathon and disclose each other.
- **Prior Work Disclosure:** Inspired by *Exodus on Canton* (Daml smart contracts, permissioned privacy, 2nd place winner at HackCanton S3). This repository is a clean, permissionless rewrite purpose-built for the NEAR ecosystem and NEAR's asynchronous cross-contract model.

---

## 2. Architecture & Design Principles

1. **One market = One contract:** The market contract acts as the PT NEP-141 token, tracks the internal YT ledger, and hosts the logit AMM curve. Swaps and flash-minting are synchronous within one contract, eliminating cross-contract swap hazards.
2. **Pure Rust Math Engine:** Fixed-point arithmetic (`exodus-math`) with 18 decimals, tested against a Python reference model.
3. **No Floats On-Chain:** Fixed-point integer math (`u128`/`i128`), with rounding always in favor of protocol solvency.
4. **Users Can Always Exit:** Even if new risk actions are paused (minting, swapping, adding liquidity), redemptions and claims are strictly permissionless.

---

## 3. Repository Structure

```text
exodus-near/
├── README.md                 # Project overview and disclosures
├── LICENSE                   # MIT License
├── docs/                     # Architectural, specification, and handoff documentation
│   ├── overview.md           # Product & protocol overview
│   ├── SPEC.md               # Detailed technical specification
│   ├── TECH_architecture.md  # Low-level architecture & stack choices
│   └── HANDOFF.md            # Work plan, progress log, and unknowns tracker
├── Cargo.toml                # Root Cargo workspace
├── crates/
│   └── exodus-math/          # Pure Rust fixed-point math engine (no_std friendly)
├── contracts/
│   ├── market/               # Main market contract (PT NEP-141 + YT ledger + Logit AMM)
│   └── mock-lst/             # Demo LST contract with admin-controllable rate for testing
├── backend/                  # Rust Axum service (keeper, indexer, REST API)
├── frontend/                 # React + Vite web application
├── tests/
│   └── sandbox/              # NEAR sandbox integration test suite
└── scripts/                  # Math reference model and testnet deployment scripts
```

---

## 4. Quickstart & Verification

### Prerequisites
- Rust stable (`rustc 1.80+`)
- `cargo-near` (for contract compilation)
- Node.js LTS (for the frontend)

### Run Workspace Tests
```bash
cargo test --workspace
```

---

## 5. Documentation Map
- [docs/HANDOFF.md](docs/HANDOFF.md): Work session logs, build checklist, and unknowns tracker.
- [docs/SPEC.md](docs/SPEC.md): Mathematical formulations, token lifecycle, and AMM invariants.
- [docs/TECH_architecture.md](docs/TECH_architecture.md): Smart contract state schemas, RPC interactions, and frontend wiring.
