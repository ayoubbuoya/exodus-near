#!/usr/bin/env bash
# Exodus Protocol - Demo Yield Advance & Index Refresh Helper (Bash)
# Usage: ./scripts/demo_advance.sh [ROOT_ACCOUNT] [PERCENT_INCREASE] [NETWORK]

set -euo pipefail

ROOT_ACCOUNT="${1:-fond-buoya.testnet}"
PERCENT_INCREASE="${2:-1}"
NETWORK="${3:-testnet}"

echo "=========================================================="
echo "     EXODUS: DEMO YIELD ADVANCE & INDEX REFRESH          "
echo "=========================================================="

MOCK_LST_ACCOUNT="mock-lst.${ROOT_ACCOUNT}"
DEMO_MARKET_ACCOUNT="demo-market.${ROOT_ACCOUNT}"

# 1. Fetch Current MockLST Rate
echo ""
echo "[1/4] Reading Current MockLST Exchange Rate..."
RATE_OUTPUT=$(near contract call-function as-read-only "${MOCK_LST_ACCOUNT}" get_rate json-args '{}' network-config "${NETWORK}" now)
echo "Raw Rate Output: ${RATE_OUTPUT}"

# Extract digits
CURRENT_RATE=$(echo "${RATE_OUTPUT}" | grep -o -E '[0-9]{24,28}' | head -n1)
echo "Current Rate (24 decimals): ${CURRENT_RATE}"

# 2. Compute Bumped Rate with python
NEW_RATE=$(python3 -c "rate = int('${CURRENT_RATE}'); print(rate + (rate * int('${PERCENT_INCREASE}')) // 100)")
echo ""
echo "[2/4] Bumping Rate by +${PERCENT_INCREASE}%..."
echo "New Rate: ${NEW_RATE}"

near contract call-function as-transaction "${MOCK_LST_ACCOUNT}" set_rate json-args "{\"new_rate\":\"${NEW_RATE}\"}" prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send

# 3. Call refresh_index on Demo Market
echo ""
echo "[3/4] Calling refresh_index() on Demo Market..."
near contract call-function as-transaction "${DEMO_MARKET_ACCOUNT}" refresh_index json-args '{}' prepaid-gas '80.0 Tgas' attached-deposit '0 NEAR' sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-keychain send

# 4. View Updated State
echo ""
echo "[4/4] Verifying Updated Market & User Yield Position..."

echo ""
echo "--- Updated Demo Market View ---"
near contract call-function as-read-only "${DEMO_MARKET_ACCOUNT}" get_market json-args '{}' network-config "${NETWORK}" now

echo ""
echo "--- User Position & Accrued Yield (${ROOT_ACCOUNT}) ---"
near contract call-function as-read-only "${DEMO_MARKET_ACCOUNT}" get_user json-args "{\"account_id\":\"${ROOT_ACCOUNT}\"}" network-config "${NETWORK}" now

echo ""
echo "=========================================================="
echo "         YIELD ADVANCE SIMULATION COMPLETE!              "
echo "=========================================================="
