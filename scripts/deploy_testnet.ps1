<#
.SYNOPSIS
    Exodus Protocol - NEAR Testnet Deployment & Liquidity Seeding Script (PowerShell)
.DESCRIPTION
    Deploys MockLST, Demo Market, and LiNEAR Market contracts to NEAR testnet,
    registers required storage, mints demo assets, seeds initial AMM liquidity,
    and runs on-chain view verification.
.PARAMETER RootAccount
    Parent testnet account ID (default: "fond-buoya.testnet").
#>

[CmdletBinding()]
param(
    [string]$RootAccount = "fond-buoya.testnet",
    [string]$Network = "testnet",
    [switch]$SkipAccountCreation,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   EXODUS ON NEAR: TESTNET DEPLOYMENT & SEEDING SCRIPT   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Root Account:   $RootAccount" -ForegroundColor Yellow
Write-Host "Network:        $Network" -ForegroundColor Yellow

# Derived Account IDs
$MockLstAccount    = "mock-lst.$RootAccount"
$DemoMarketAccount = "demo-market.$RootAccount"
$LinearMarketAccount = "linear-market.$RootAccount"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

$MockLstWasm = Join-Path $ProjectRoot "target\near\mock_lst\mock_lst.wasm"
$MarketWasm  = Join-Path $ProjectRoot "target\near\market\market.wasm"

# 1. Build Verification
if (-not $SkipBuild) {
    Write-Host "`n[1/7] Verifying Contract WASM Binaries..." -ForegroundColor Green
    if (-not (Test-Path $MockLstWasm) -or -not (Test-Path $MarketWasm)) {
        Write-Host "Building WASM contracts with cargo near..." -ForegroundColor Yellow
        Push-Location $ProjectRoot
        cargo near build non-reproducible-wasm --no-abi --manifest-path contracts/mock-lst/Cargo.toml
        cargo near build non-reproducible-wasm --no-abi --manifest-path contracts/market/Cargo.toml
        Pop-Location
    }
}

if (-not (Test-Path $MockLstWasm)) {
    throw "MockLST WASM not found at $MockLstWasm"
}
if (-not (Test-Path $MarketWasm)) {
    throw "Market WASM not found at $MarketWasm"
}
Write-Host "  -> Found MockLST WASM: $MockLstWasm" -ForegroundColor Gray
Write-Host "  -> Found Market WASM:  $MarketWasm" -ForegroundColor Gray

# Helper to run near-cli commands
function Invoke-Near {
    param([string]$CommandDesc, [scriptblock]$Action)
    Write-Host "  $CommandDesc..." -ForegroundColor Gray
    try {
        & $Action
    } catch {
        Write-Warning "Failed or already exists: $_"
    }
}

# 2. Sub-account creation
if (-not $SkipAccountCreation) {
    Write-Host "`n[2/7] Creating Sub-Accounts (if needed)..." -ForegroundColor Green
    
    Invoke-Near "Creating $MockLstAccount" {
        near account create-account fund-myself $MockLstAccount '5 NEAR' autogenerate-new-keypair save-to-keychain sign-as $RootAccount network-config $Network sign-with-keychain send
    }
    Invoke-Near "Creating $DemoMarketAccount" {
        near account create-account fund-myself $DemoMarketAccount '10 NEAR' autogenerate-new-keypair save-to-keychain sign-as $RootAccount network-config $Network sign-with-keychain send
    }
    Invoke-Near "Creating $LinearMarketAccount" {
        near account create-account fund-myself $LinearMarketAccount '10 NEAR' autogenerate-new-keypair save-to-keychain sign-as $RootAccount network-config $Network sign-with-keychain send
    }
}

# 3. Deploy & Init MockLST
Write-Host "`n[3/7] Deploying & Initializing MockLST ($MockLstAccount)..." -ForegroundColor Green
near contract deploy $MockLstAccount use-file $MockLstWasm without-init-call network-config $Network sign-with-keychain send

$mockLstInitArgs = "{`"owner_id`":`"$RootAccount`"}"
Invoke-Near "Initializing MockLST" {
    near contract call-function as-transaction $MockLstAccount new_default_meta json-args $mockLstInitArgs prepaid-gas '50.0 Tgas' attached-deposit '0 NEAR' sign-as $RootAccount network-config $Network sign-with-keychain send
}

# 4. Deploy & Init Demo Market (MockLST underlying, 3 days expiry)
Write-Host "`n[4/7] Deploying & Initializing Demo Market ($DemoMarketAccount)..." -ForegroundColor Green
near contract deploy $DemoMarketAccount use-file $MarketWasm without-init-call network-config $Network sign-with-keychain send

# Expiry in 3 days (in nanoseconds)
$CurrentEpochSec = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$ExpiryNs = ($CurrentEpochSec + (3 * 86400)) * [int64]1000000000

$demoInitArgs = "{`"owner_id`":`"$RootAccount`",`"treasury_id`":`"$RootAccount`",`"lst_id`":`"$MockLstAccount`",`"rate_source`":`"Mock`",`"expiry_ns`":$ExpiryNs,`"pt_name`":`"PT MockLST DEMO`",`"pt_symbol`":`"PT-MockLST`",`"initial_index`":`"1000000000000000000`",`"interest_fee_bps`":300,`"scalar_root`":`"10000000000000000000`",`"initial_anchor`":`"1020000000000000000`",`"ln_fee_rate_root`":`"999500333083417`",`"reserve_fee_bps`":2000}"

Invoke-Near "Initializing Demo Market" {
    near contract call-function as-transaction $DemoMarketAccount new json-args $demoInitArgs prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as $RootAccount network-config $Network sign-with-keychain send
}

# 5. Deploy & Init LiNEAR Market (linear-protocol.testnet underlying, 31-MAR-2027 expiry)
Write-Host "`n[5/7] Deploying & Initializing LiNEAR Market ($LinearMarketAccount)..." -ForegroundColor Green
near contract deploy $LinearMarketAccount use-file $MarketWasm without-init-call network-config $Network sign-with-keychain send

# 31 March 2027 00:00:00 UTC = 1806451200 seconds -> 1806451200000000000 ns
$LinearExpiryNs = 1806451200000000000
$LinearInitIndex = "2284175768908950653" # Current testnet LiNEAR rate (18 decimals fixed point)

$linearInitArgs = "{`"owner_id`":`"$RootAccount`",`"treasury_id`":`"$RootAccount`",`"lst_id`":`"linear-protocol.testnet`",`"rate_source`":`"Linear`",`"expiry_ns`":$LinearExpiryNs,`"pt_name`":`"PT LiNEAR 31MAR2027`",`"pt_symbol`":`"PT-LiNEAR-27`",`"initial_index`":`"$LinearInitIndex`",`"interest_fee_bps`":300,`"scalar_root`":`"10000000000000000000`",`"initial_anchor`":`"1020000000000000000`",`"ln_fee_rate_root`":`"999500333083417`",`"reserve_fee_bps`":2000}"

Invoke-Near "Initializing LiNEAR Market" {
    near contract call-function as-transaction $LinearMarketAccount new json-args $linearInitArgs prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as $RootAccount network-config $Network sign-with-keychain send
}

# 6. Storage Registration & Liquidity Seeding (Demo Market)
Write-Host "`n[6/7] Storage Registration & Seeding Liquidity on Demo Market..." -ForegroundColor Green

# 6.1 Register storage for Root and DemoMarket on MockLST
Write-Host "  -> Registering storage on MockLST..." -ForegroundColor Gray
$regRootMockLst = "{`"account_id`":`"$RootAccount`"}"
near contract call-function as-transaction $MockLstAccount storage_deposit json-args $regRootMockLst prepaid-gas '30.0 Tgas' attached-deposit '0.0125 NEAR' sign-as $RootAccount network-config $Network sign-with-keychain send

$regDemoMarketMockLst = "{`"account_id`":`"$DemoMarketAccount`"}"
near contract call-function as-transaction $MockLstAccount storage_deposit json-args $regDemoMarketMockLst prepaid-gas '30.0 Tgas' attached-deposit '0.0125 NEAR' sign-as $RootAccount network-config $Network sign-with-keychain send

# 6.2 Register storage for Root on DemoMarket
Write-Host "  -> Registering storage on Demo Market..." -ForegroundColor Gray
$regRootDemoMarket = "{`"account_id`":`"$RootAccount`"}"
near contract call-function as-transaction $DemoMarketAccount storage_deposit json-args $regRootDemoMarket prepaid-gas '30.0 Tgas' attached-deposit '0.0125 NEAR' sign-as $RootAccount network-config $Network sign-with-keychain send

# 6.3 Claim MockLST from Faucet (100 MockLST)
Write-Host "  -> Claiming 100 MockLST from faucet..." -ForegroundColor Gray
near contract call-function as-transaction $MockLstAccount faucet_claim json-args '{}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as $RootAccount network-config $Network sign-with-keychain send

# 6.4 Mint 50 PT + 50 YT (using 50 MockLST)
Write-Host "  -> Minting 50 PT + 50 YT..." -ForegroundColor Gray
$mintArgs = "{`"receiver_id`":`"$DemoMarketAccount`",`"amount`":`"50000000000000000000000000`",`"msg`":`"{\\`"action\\`":\\`"mint_py\\`"}`"}"
near contract call-function as-transaction $MockLstAccount ft_transfer_call json-args $mintArgs prepaid-gas '100.0 Tgas' attached-deposit '1 yoctoNEAR' sign-as $RootAccount network-config $Network sign-with-keychain send

# 6.5 Add Initial Liquidity: 25 PT + 25 MockLST
Write-Host "  -> Seeding AMM Pool with 25 PT + 25 MockLST..." -ForegroundColor Gray
$seedLiquidityArgs = "{`"receiver_id`":`"$DemoMarketAccount`",`"amount`":`"25000000000000000000000000`",`"msg`":`"{\\`"action\\`":\\`"add_liquidity\\`",\\`"pt_desired\\`":\\`"25000000000000000000000000\\`",\\`"min_lp_out\\`":\\`"1000\\`"}`"}"
near contract call-function as-transaction $MockLstAccount ft_transfer_call json-args $seedLiquidityArgs prepaid-gas '100.0 Tgas' attached-deposit '1 yoctoNEAR' sign-as $RootAccount network-config $Network sign-with-keychain send

# 7. Verification View Calls
Write-Host "`n[7/7] Verifying Testnet View Calls..." -ForegroundColor Green

Write-Host "`n--- Demo Market View ---" -ForegroundColor Yellow
near contract call-function as-read-only $DemoMarketAccount get_market json-args '{}' network-config $Network now

Write-Host "`n--- Demo Market Pool View ---" -ForegroundColor Yellow
near contract call-function as-read-only $DemoMarketAccount get_pool json-args '{}' network-config $Network now

Write-Host "`n--- LiNEAR Market View ---" -ForegroundColor Yellow
near contract call-function as-read-only $LinearMarketAccount get_market json-args '{}' network-config $Network now

Write-Host "`n--- LiNEAR Market Pool View ---" -ForegroundColor Yellow
near contract call-function as-read-only $LinearMarketAccount get_pool json-args '{}' network-config $Network now

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "   EXODUS TESTNET DEPLOYMENT COMPLETED SUCCESSFULLY!    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "MockLST:       $MockLstAccount" -ForegroundColor Green
Write-Host "Demo Market:   $DemoMarketAccount" -ForegroundColor Green
Write-Host "LiNEAR Market: $LinearMarketAccount" -ForegroundColor Green
