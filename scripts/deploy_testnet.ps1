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

function Invoke-ContractTx {
    param(
        [string]$Account,
        [string]$Method,
        [string]$JsonArgs,
        [string]$Gas = "50.0 Tgas",
        [string]$Deposit = "0 NEAR",
        [string]$Signer = $RootAccount
    )
    $tmpFile = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    try {
        [System.IO.File]::WriteAllText($tmpFile, $JsonArgs, $utf8NoBom)
        near contract call-function as-transaction $Account $Method file-args $tmpFile prepaid-gas $Gas attached-deposit $Deposit sign-as $Signer network-config $Network sign-with-keychain send
    } catch {
        Write-Warning "Transaction failed or already completed: $_"
    } finally {
        if (Test-Path $tmpFile) { Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue }
    }
}

function Invoke-ContractView {
    param(
        [string]$Account,
        [string]$Method,
        [string]$JsonArgs = "{}"
    )
    $tmpFile = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    try {
        [System.IO.File]::WriteAllText($tmpFile, $JsonArgs, $utf8NoBom)
        near contract call-function as-read-only $Account $Method file-args $tmpFile network-config $Network now
    } catch {
        Write-Warning "View call failed: $_"
    } finally {
        if (Test-Path $tmpFile) { Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue }
    }
}

# 2. Sub-account creation
if (-not $SkipAccountCreation) {
    Write-Host "`n[2/7] Creating Sub-Accounts (if needed)..." -ForegroundColor Green
    
    Invoke-Near "Creating $MockLstAccount" {
        near account create-account fund-myself $MockLstAccount '5 NEAR' autogenerate-new-keypair save-to-keychain sign-as $RootAccount network-config $Network sign-with-keychain send
    }
    Invoke-Near "Creating $DemoMarketAccount" {
        near account create-account fund-myself $DemoMarketAccount '6 NEAR' autogenerate-new-keypair save-to-keychain sign-as $RootAccount network-config $Network sign-with-keychain send
    }
    Invoke-Near "Creating $LinearMarketAccount" {
        near account create-account fund-myself $LinearMarketAccount '6 NEAR' autogenerate-new-keypair save-to-keychain sign-as $RootAccount network-config $Network sign-with-keychain send
    }
}

# 3. Deploy & Init MockLST
Write-Host "`n[3/7] Deploying & Initializing MockLST ($MockLstAccount)..." -ForegroundColor Green
near contract deploy $MockLstAccount use-file $MockLstWasm without-init-call network-config $Network sign-with-keychain send

$mockLstInitArgs = '{"owner_id":"' + $RootAccount + '"}'
Invoke-ContractTx $MockLstAccount "new_default_meta" $mockLstInitArgs "50.0 Tgas" "0 NEAR" $RootAccount

# 4. Deploy & Init Demo Market
Write-Host "`n[4/7] Deploying & Initializing Demo Market ($DemoMarketAccount)..." -ForegroundColor Green
near contract deploy $DemoMarketAccount use-file $MarketWasm without-init-call network-config $Network sign-with-keychain send

# Expiry on 31 Mar 2027 00:00:00 UTC (matching frontend config)
$ExpiryNs = 1806451200000000000

$demoInitArgs = @"
{
  "owner_id": "$RootAccount",
  "treasury_id": "$RootAccount",
  "lst_id": "$MockLstAccount",
  "rate_source": "Mock",
  "expiry_ns": $ExpiryNs,
  "pt_name": "PT MockLST 31MAR2027",
  "pt_symbol": "PT-MockLST",
  "initial_index": "1000000000000000000",
  "interest_fee_bps": 300,
  "scalar_root": "10000000000000000000",
  "initial_anchor": "1020000000000000000",
  "ln_fee_rate_root": "999500333083417",
  "reserve_fee_bps": 2000
}
"@
Invoke-ContractTx $DemoMarketAccount "new" $demoInitArgs "100.0 Tgas" "0 NEAR" $RootAccount

# 5. Deploy & Init LiNEAR Market (linear-protocol.testnet underlying, 31-MAR-2027 expiry)
Write-Host "`n[5/7] Deploying & Initializing LiNEAR Market ($LinearMarketAccount)..." -ForegroundColor Green
near contract deploy $LinearMarketAccount use-file $MarketWasm without-init-call network-config $Network sign-with-keychain send

# 31 March 2027 00:00:00 UTC = 1806451200 seconds -> 1806451200000000000 ns
$LinearExpiryNs = 1806451200000000000
$LinearInitIndex = "2284175768908950653" # Current testnet LiNEAR rate (18 decimals fixed point)

$linearInitArgs = @"
{
  "owner_id": "$RootAccount",
  "treasury_id": "$RootAccount",
  "lst_id": "linear-protocol.testnet",
  "rate_source": "Linear",
  "expiry_ns": $LinearExpiryNs,
  "pt_name": "PT LiNEAR 31MAR2027",
  "pt_symbol": "PT-LiNEAR-27",
  "initial_index": "$LinearInitIndex",
  "interest_fee_bps": 300,
  "scalar_root": "10000000000000000000",
  "initial_anchor": "1020000000000000000",
  "ln_fee_rate_root": "999500333083417",
  "reserve_fee_bps": 2000
}
"@
Invoke-ContractTx $LinearMarketAccount "new" $linearInitArgs "100.0 Tgas" "0 NEAR" $RootAccount

# 6. Storage Registration & Liquidity Seeding (Demo Market)
Write-Host "`n[6/7] Storage Registration & Seeding Liquidity on Demo Market..." -ForegroundColor Green

# 6.1 Register storage for Root and DemoMarket on MockLST
Write-Host "  -> Registering storage on MockLST..." -ForegroundColor Gray
$regRootMockLst = '{"account_id":"' + $RootAccount + '"}'
Invoke-ContractTx $MockLstAccount "storage_deposit" $regRootMockLst "30.0 Tgas" "0.0125 NEAR" $RootAccount

$regDemoMarketMockLst = '{"account_id":"' + $DemoMarketAccount + '"}'
Invoke-ContractTx $MockLstAccount "storage_deposit" $regDemoMarketMockLst "30.0 Tgas" "0.0125 NEAR" $RootAccount

# 6.2 Register storage for Root on DemoMarket
Write-Host "  -> Registering storage on Demo Market..." -ForegroundColor Gray
$regRootDemoMarket = '{"account_id":"' + $RootAccount + '"}'
Invoke-ContractTx $DemoMarketAccount "storage_deposit" $regRootDemoMarket "30.0 Tgas" "0.0125 NEAR" $RootAccount

# 6.3 Claim MockLST from Faucet (100 MockLST)
Write-Host "  -> Claiming 100 MockLST from faucet..." -ForegroundColor Gray
Invoke-ContractTx $MockLstAccount "faucet" "{}" "30.0 Tgas" "0 NEAR" $RootAccount

# 6.4 Mint 50 PT + 50 YT (using 50 MockLST)
Write-Host "  -> Minting 50 PT + 50 YT..." -ForegroundColor Gray
$mintArgs = @"
{
  "receiver_id": "$DemoMarketAccount",
  "amount": "50000000000000000000000000",
  "msg": "{\"action\":\"mint_py\"}"
}
"@
Invoke-ContractTx $MockLstAccount "ft_transfer_call" $mintArgs "100.0 Tgas" "1 yoctoNEAR" $RootAccount

# 6.5 Add Initial Liquidity: 25 PT + 25 MockLST
Write-Host "  -> Seeding AMM Pool with 25 PT + 25 MockLST..." -ForegroundColor Gray
$seedLiquidityArgs = @"
{
  "receiver_id": "$DemoMarketAccount",
  "amount": "25000000000000000000000000",
  "msg": "{\"action\":\"add_liquidity\",\"pt_desired\":\"25000000000000000000000000\",\"min_lp_out\":\"1000\"}"
}
"@
Invoke-ContractTx $MockLstAccount "ft_transfer_call" $seedLiquidityArgs "100.0 Tgas" "1 yoctoNEAR" $RootAccount

# 7. Verification View Calls
Write-Host "`n[7/7] Verifying Testnet View Calls..." -ForegroundColor Green

Write-Host "`n--- Demo Market View ---" -ForegroundColor Yellow
Invoke-ContractView $DemoMarketAccount "get_market"

Write-Host "`n--- Demo Market Pool View ---" -ForegroundColor Yellow
Invoke-ContractView $DemoMarketAccount "get_pool"

Write-Host "`n--- LiNEAR Market View ---" -ForegroundColor Yellow
Invoke-ContractView $LinearMarketAccount "get_market"

Write-Host "`n--- LiNEAR Market Pool View ---" -ForegroundColor Yellow
Invoke-ContractView $LinearMarketAccount "get_pool"

Write-Host "`n--- Demo Market YT Swap Preview (1 MockLST in) ---" -ForegroundColor Yellow
$previewYtArgs = '{"sy_in":"1000000000000000000000000"}'
Invoke-ContractView $DemoMarketAccount "preview_swap_exact_sy_for_yt" $previewYtArgs

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "   EXODUS TESTNET DEPLOYMENT COMPLETED SUCCESSFULLY!    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "MockLST:       $MockLstAccount" -ForegroundColor Green
Write-Host "Demo Market:   $DemoMarketAccount" -ForegroundColor Green
Write-Host "LiNEAR Market: $LinearMarketAccount" -ForegroundColor Green
