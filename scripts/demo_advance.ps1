<#
.SYNOPSIS
    Exodus Protocol - Demo Yield Advance & Index Refresh Helper (PowerShell)
.DESCRIPTION
    Simulates staking yield progression for the Demo Market:
    1. Reads current MockLST exchange rate.
    2. Bumps the exchange rate on-chain (+1% by default).
    3. Calls refresh_index() on Demo Market to trigger epoch rate fetch and yield accrual.
    4. Displays updated market metrics and accrued interest.
.PARAMETER RootAccount
    Parent testnet account ID (default: "fond-buoya.testnet").
.PARAMETER IncreasePercent
    Percentage to increase exchange rate (default: 1.0).
#>

[CmdletBinding()]
param(
    [string]$RootAccount = "fond-buoya.testnet",
    [string]$Network = "testnet",
    [double]$IncreasePercent = 1.0
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     EXODUS: DEMO YIELD ADVANCE & INDEX REFRESH          " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$MockLstAccount    = "mock-lst.$RootAccount"
$DemoMarketAccount = "demo-market.$RootAccount"

function Invoke-ContractTx {
    param(
        [string]$Account,
        [string]$Method,
        [string]$JsonArgs = "{}",
        [string]$Gas = "50.0 Tgas",
        [string]$Deposit = "0 NEAR",
        [string]$Signer = $RootAccount
    )
    $tmpFile = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    try {
        [System.IO.File]::WriteAllText($tmpFile, $JsonArgs, $utf8NoBom)
        near contract call-function as-transaction $Account $Method file-args $tmpFile prepaid-gas $Gas attached-deposit $Deposit sign-as $Signer network-config $Network sign-with-keychain send
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
    } finally {
        if (Test-Path $tmpFile) { Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue }
    }
}

# 1. Fetch Current MockLST Rate
Write-Host "`n[1/4] Reading Current MockLST Exchange Rate..." -ForegroundColor Green
$rateOutput = Invoke-ContractView -Account $MockLstAccount -Method "get_rate" -JsonArgs "{}"
Write-Host "Raw Rate Output: $rateOutput" -ForegroundColor Gray

# Extract numeric rate string (handles quoted or raw JSON string)
$rateMatch = [regex]::Match($rateOutput, '"?(\d{24,28})"?')
if (-not $rateMatch.Success) {
    throw "Failed to parse exchange rate from output: $rateOutput"
}

$currentRateStr = $rateMatch.Groups[1].Value
$currentRate = [System.Numerics.BigInteger]::Parse($currentRateStr)
Write-Host "Current Rate (24 decimals): $currentRate yoctoNEAR" -ForegroundColor Yellow

# 2. Compute Bumped Rate (+IncreasePercent)
$multiplier = [int]($IncreasePercent * 100)
$newRate = $currentRate + (($currentRate * $multiplier) / 10000)
$newRateStr = $newRate.ToString()

Write-Host "`n[2/4] Bumping Rate by +$IncreasePercent%..." -ForegroundColor Green
Write-Host "New Rate: $newRateStr" -ForegroundColor Yellow

$setRateArgs = "{`"new_rate`":`"$newRateStr`"}"
Invoke-ContractTx -Account $MockLstAccount -Method "set_rate" -JsonArgs $setRateArgs -Gas "30.0 Tgas"

# 3. Call refresh_index on Demo Market
Write-Host "`n[3/4] Calling refresh_index() on Demo Market..." -ForegroundColor Green
Invoke-ContractTx -Account $DemoMarketAccount -Method "refresh_index" -JsonArgs "{}" -Gas "80.0 Tgas"

# 4. View Updated State
Write-Host "`n[4/4] Verifying Updated Market & User Yield Position..." -ForegroundColor Green

Write-Host "`n--- Updated Demo Market View ---" -ForegroundColor Yellow
Invoke-ContractView -Account $DemoMarketAccount -Method "get_market" -JsonArgs "{}"

Write-Host "`n--- User Position & Accrued Yield ($RootAccount) ---" -ForegroundColor Yellow
$userArgs = "{`"account_id`":`"$RootAccount`"}"
Invoke-ContractView -Account $DemoMarketAccount -Method "get_user" -JsonArgs $userArgs

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "         YIELD ADVANCE SIMULATION COMPLETE!              " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
