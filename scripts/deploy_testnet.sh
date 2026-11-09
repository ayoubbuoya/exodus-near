#!/usr/bin/env bash
# Exodus Protocol - NEAR Testnet Deployment & Liquidity Seeding Script (Bash)
# Usage: ./scripts/deploy_testnet.sh [ROOT_ACCOUNT] [NETWORK]

set -euo pipefail

ROOT_ACCOUNT="${1:-fond-buoya.testnet}"
NETWORK="${2:-testnet}"

echo "=========================================================="
echo "   EXODUS ON NEAR: TESTNET DEPLOYMENT & SEEDING SCRIPT   "
echo "=========================================================="
echo "Root Account:   ${ROOT_ACCOUNT}"
echo "Network:        ${NETWORK}"

MOCK_LST_ACCOUNT="mock-lst.${ROOT_ACCOUNT}"
DEMO_MARKET_ACCOUNT="demo-market.${ROOT_ACCOUNT}"
LINEAR_MARKET_ACCOUNT="linear-market.${ROOT_ACCOUNT}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"

MOCK_LST_WASM="${PROJECT_ROOT}/target/near/mock_lst/mock_lst.wasm"
MARKET_WASM="${PROJECT_ROOT}/target/near/market/market.wasm"

# 1. Build Verification
echo ""
echo "[1/7] Verifying Contract WASM Binaries..."
if [ ! -f "${MOCK_LST_WASM}" ] || [ ! -f "${MARKET_WASM}" ]; then
    echo "Building WASM contracts with cargo near..."
    (cd "${PROJECT_ROOT}" && cargo near build non-reproducible-wasm --no-abi --manifest-path contracts/mock-lst/Cargo.toml)
    (cd "${PROJECT_ROOT}" && cargo near build non-reproducible-wasm --no-abi --manifest-path contracts/market/Cargo.toml)
fi

echo "  -> Found MockLST WASM: ${MOCK_LST_WASM}"
echo "  -> Found Market WASM:  ${MARKET_WASM}"

# Helper to run near command ignoring already-exists errors
run_near_safe() {
    echo "  $1..."
    shift
    "$@" || echo "  [Notice] Command finished or account/state already exists."
}

# 2. Sub-account creation
echo ""
echo "[2/7] Creating Sub-Accounts (if needed)..."
run_near_safe "Creating ${MOCK_LST_ACCOUNT}" near account create-account fund-myself "${MOCK_LST_ACCOUNT}" '5 NEAR' autogenerate-new-keypair save-to-keychain sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send
run_near_safe "Creating ${DEMO_MARKET_ACCOUNT}" near account create-account fund-myself "${DEMO_MARKET_ACCOUNT}" '10 NEAR' autogenerate-new-keypair save-to-keychain sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send
run_near_safe "Creating ${LINEAR_MARKET_ACCOUNT}" near account create-account fund-myself "${LINEAR_MARKET_ACCOUNT}" '10 NEAR' autogenerate-new-keypair save-to-keychain sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send

# 3. Deploy & Init MockLST
echo ""
echo "[3/7] Deploying & Initializing MockLST (${MOCK_LST_ACCOUNT})..."
near contract deploy "${MOCK_LST_ACCOUNT}" use-file "${MOCK_LST_WASM}" without-init-call network-config "${NETWORK}" sign-with-keychain send
run_near_safe "Initializing MockLST" near contract call-function as-transaction "${MOCK_LST_ACCOUNT}" new_default_meta json-args "{\"owner_id\":\"${ROOT_ACCOUNT}\"}" prepaid-gas '50.0 Tgas' attached-deposit '0 NEAR' sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send

# 4. Deploy & Init Demo Market
echo ""
echo "[4/7] Deploying & Initializing Demo Market (${DEMO_MARKET_ACCOUNT})..."
near contract deploy "${DEMO_MARKET_ACCOUNT}" use-file "${MARKET_WASM}" without-init-call network-config "${NETWORK}" sign-with-keychain send

NOW_SEC=$(date +%s)
EXPIRY_NS=$(( (NOW_SEC + 3 * 86400) * 1000000000 ))

DEMO_INIT_ARGS="{\"owner_id\":\"${ROOT_ACCOUNT}\",\"treasury_id\":\"${ROOT_ACCOUNT}\",\"lst_id\":\"${MOCK_LST_ACCOUNT}\",\"rate_source\":\"Mock\",\"expiry_ns\":${EXPIRY_NS},\"pt_name\":\"PT MockLST DEMO\",\"pt_symbol\":\"PT-MockLST\",\"initial_index\":\"1000000000000000000\",\"interest_fee_bps\":300,\"scalar_root\":\"10000000000000000000\",\"initial_anchor\":\"1020000000000000000\",\"ln_fee_rate_root\":\"999500333083417\",\"reserve_fee_bps\":2000}"

run_near_safe "Initializing Demo Market" near contract call-function as-transaction "${DEMO_MARKET_ACCOUNT}" new json-args "${DEMO_INIT_ARGS}" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send

# 5. Deploy & Init LiNEAR Market
echo ""
echo "[5/7] Deploying & Initializing LiNEAR Market (${LINEAR_MARKET_ACCOUNT})..."
near contract deploy "${LINEAR_MARKET_ACCOUNT}" use-file "${MARKET_WASM}" without-init-call network-config "${NETWORK}" sign-with-keychain send

LINEAR_EXPIRY_NS=1806451200000000000
LINEAR_INIT_INDEX="2284175768908950653"

LINEAR_INIT_ARGS="{\"owner_id\":\"${ROOT_ACCOUNT}\",\"treasury_id\":\"${ROOT_ACCOUNT}\",\"lst_id\":\"linear-protocol.testnet\",\"rate_source\":\"Linear\",\"expiry_ns\":${LINEAR_EXPIRY_NS},\"pt_name\":\"PT LiNEAR 31MAR2027\",\"pt_symbol\":\"PT-LiNEAR-27\",\"initial_index\":\"${LINEAR_INIT_INDEX}\",\"interest_fee_bps\":300,\"scalar_root\":\"10000000000000000000\",\"initial_anchor\":\"1020000000000000000\",\"ln_fee_rate_root\":\"999500333083417\",\"reserve_fee_bps\":2000}"

run_near_safe "Initializing LiNEAR Market" near contract call-function as-transaction "${LINEAR_MARKET_ACCOUNT}" new json-args "${LINEAR_INIT_ARGS}" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send

# 6. Storage Registration & Liquidity Seeding (Demo Market)
echo ""
echo "[6/7] Storage Registration & Seeding Liquidity on Demo Market..."

echo "  -> Registering storage on MockLST..."
run_near_safe "Register Root on MockLST" near contract call-function as-transaction "${MOCK_LST_ACCOUNT}" storage_deposit json-args "{\"account_id\":\"${ROOT_ACCOUNT}\"}" prepaid-gas '30.0 Tgas' attached-deposit '0.0125 NEAR' sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send
run_near_safe "Register DemoMarket on MockLST" near contract call-function as-transaction "${MOCK_LST_ACCOUNT}" storage_deposit json-args "{\"account_id\":\"${DEMO_MARKET_ACCOUNT}\"}" prepaid-gas '30.0 Tgas' attached-deposit '0.0125 NEAR' sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send

echo "  -> Registering storage on Demo Market..."
run_near_safe "Register Root on DemoMarket" near contract call-function as-transaction "${DEMO_MARKET_ACCOUNT}" storage_deposit json-args "{\"account_id\":\"${ROOT_ACCOUNT}\"}" prepaid-gas '30.0 Tgas' attached-deposit '0.0125 NEAR' sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send

echo "  -> Claiming 100 MockLST from faucet..."
run_near_safe "Claim MockLST" near contract call-function as-transaction "${MOCK_LST_ACCOUNT}" faucet_claim json-args '{}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send

echo "  -> Minting 50 PT + 50 YT..."
MINT_ARGS="{\"receiver_id\":\"${DEMO_MARKET_ACCOUNT}\",\"amount\":\"50000000000000000000000000\",\"msg\":\"{\\\"action\\\":\\\"mint_py\\\"}\"}"
run_near_safe "Mint PY" near contract call-function as-transaction "${MOCK_LST_ACCOUNT}" ft_transfer_call json-args "${MINT_ARGS}" prepaid-gas '100.0 Tgas' attached-deposit '1 yoctoNEAR' sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send

echo "  -> Seeding AMM Pool with 25 PT + 25 MockLST..."
SEED_ARGS="{\"receiver_id\":\"${DEMO_MARKET_ACCOUNT}\",\"amount\":\"25000000000000000000000000\",\"msg\":\"{\\\"action\\\":\\\"add_liquidity\\\",\\\"pt_desired\\\":\\\"25000000000000000000000000\\\",\\\"min_lp_out\\\":\\\"1000\\\"}\"}"
run_near_safe "Add Liquidity" near contract call-function as-transaction "${MOCK_LST_ACCOUNT}" ft_transfer_call json-args "${SEED_ARGS}" prepaid-gas '100.0 Tgas' attached-deposit '1 yoctoNEAR' sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send

# 7. Verification View Calls
echo ""
echo "[7/7] Verifying Testnet View Calls..."

echo ""
echo "--- Demo Market View ---"
near contract call-function as-read-only "${DEMO_MARKET_ACCOUNT}" get_market json-args '{}' network-config "${NETWORK}" now

echo ""
echo "--- Demo Market Pool View ---"
near contract call-function as-read-only "${DEMO_MARKET_ACCOUNT}" get_pool json-args '{}' network-config "${NETWORK}" now

echo ""
echo "--- LiNEAR Market View ---"
near contract call-function as-read-only "${LINEAR_MARKET_ACCOUNT}" get_market json-args '{}' network-config "${NETWORK}" now

echo ""
echo "--- LiNEAR Market Pool View ---"
near contract call-function as-read-only "${LINEAR_MARKET_ACCOUNT}" get_pool json-args '{}' network-config "${NETWORK}" now

echo ""
echo "=========================================================="
echo "   EXODUS TESTNET DEPLOYMENT COMPLETED SUCCESSFULLY!    "
echo "=========================================================="
echo "MockLST:       ${MOCK_LST_ACCOUNT}"
echo "Demo Market:   ${DEMO_MARKET_ACCOUNT}"
echo "LiNEAR Market: ${LINEAR_MARKET_ACCOUNT}"
