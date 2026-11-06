//! Exodus Market Contract
//!
//! Manages PT (Principal Token) NEP-141 token, internal YT (Yield Token) ledger,
//! exchange rate index refresh, interest accruals, and maturity redemptions.

pub mod events;

use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::store::LookupMap;
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, BorshStorageKey, Gas,
    NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue,
};

/// Decimals scale factor: LST price methods return 24 decimals,
/// py_index uses 18-decimal fixed point (1e18 = 1.0 NEAR).
/// 10^24 / 10^18 = 10^6.
pub const LST_DECIMAL_SCALE: u128 = 1_000_000;

/// Default protocol fee on YT yield: 300 bps (3.0%).
pub const DEFAULT_INTEREST_FEE_BPS: u16 = 300;

/// Maximum allowed interest fee: 1000 bps (10.0%).
pub const MAX_INTEREST_FEE_BPS: u16 = 1000;

/// Default AMM scalar root: 10 * 1e18 (fixed point).
pub const DEFAULT_SCALAR_ROOT: u128 = 10_000_000_000_000_000_000;

/// Default AMM initial anchor: 1.02 * 1e18 (~8% implied APY).
pub const DEFAULT_INITIAL_ANCHOR: u128 = 1_020_000_000_000_000_000;

/// Default AMM fee rate root: ln(1.001) in 1e18 fixed point (~0.1% annualized fee).
pub const DEFAULT_LN_FEE_RATE_ROOT: i128 = 999_500_333_083_417;

/// Default AMM reserve fee: 2000 bps (20.0% of trade fees to treasury).
pub const DEFAULT_RESERVE_FEE_BPS: u16 = 2000;

/// Gas allocated for outbound ft_transfer call.
pub const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(20);

/// Gas allocated for callback on ft_transfer completion.
pub const GAS_FOR_RESOLVE_FT_TRANSFER: Gas = Gas::from_tgas(10);

/// Gas allocated for rate fetching view call.
pub const GAS_FOR_RATE_QUERY: Gas = Gas::from_tgas(15);

/// Gas allocated for index fetched callback.
pub const GAS_FOR_ON_INDEX_FETCHED: Gas = Gas::from_tgas(15);

#[near]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    FungibleToken,
    Metadata,
    YtBalances,
    UserInterest,
    PendingRefunds,
    LpBalances,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RateSource {
    Mock,
    MetaPool,
    Linear,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct UserInterest {
    /// Index at last accrual (18 decimals fixed point).
    pub user_index: u128,
    /// Accrued, unclaimed LST yield (24 decimals).
    pub accrued_sy: u128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct MarketView {
    pub owner_id: AccountId,
    pub treasury_id: AccountId,
    pub lst_id: AccountId,
    pub rate_source: RateSource,
    pub expiry_ns: u64,
    pub interest_fee_bps: u16,
    pub paused: bool,
    pub py_index: U128,
    pub index_epoch: u64,
    pub index_updated_ns: u64,
    pub index_at_maturity: Option<U128>,
    pub pt_total_supply: U128,
    pub yt_total_supply: U128,
    pub sy_reserved_for_interest: U128,
    pub treasury_sy: U128,
    pub total_pt: U128,
    pub total_sy: U128,
    pub total_lp: U128,
    pub last_ln_implied_rate: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct UserPositionView {
    pub pt_balance: U128,
    pub yt_balance: U128,
    pub user_index: U128,
    pub accrued_sy: U128,
    pub pending_refund: U128,
    pub lp_balance: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SwapPreviewView {
    pub amount_out: U128,
    pub fee_sy: U128,
    pub new_last_ln_implied_rate: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PoolView {
    pub total_pt: U128,
    pub total_sy: U128,
    pub total_lp: U128,
    pub last_ln_implied_rate: String,
    pub scalar_root: U128,
    pub ln_fee_rate_root: String,
}

#[ext_contract(ext_lst)]
pub trait ExtLst {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn get_rate(&self) -> U128;
    fn get_st_near_price(&self) -> U128;
    fn ft_price(&self) -> U128;
}

#[ext_contract(ext_self)]
pub trait ExtSelf {
    fn on_index_fetched(&mut self) -> U128;
    fn on_ft_transfer_complete(&mut self, receiver_id: AccountId, amount: U128) -> bool;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Market {
    // Config
    pub owner_id: AccountId,
    pub treasury_id: AccountId,
    pub lst_id: AccountId,
    pub rate_source: RateSource,
    pub expiry_ns: u64,
    pub interest_fee_bps: u16,
    pub paused: bool,

    // Index state (18 decimals: 1e18 = 1.0 NEAR)
    pub py_index: u128,
    pub index_epoch: u64,
    pub index_updated_ns: u64,
    pub index_at_maturity: Option<u128>,

    // PT token (NEP-141)
    pub pt: FungibleToken,
    pub pt_metadata: LazyOption<FungibleTokenMetadata>,

    // YT ledger
    pub yt_balances: LookupMap<AccountId, u128>,
    pub yt_total_supply: u128,
    pub user_interest: LookupMap<AccountId, UserInterest>,

    // AMM state
    pub total_pt: u128,
    pub total_sy: u128,
    pub total_lp: u128,
    pub lp_balances: LookupMap<AccountId, u128>,
    pub last_ln_implied_rate: i128,
    pub scalar_root: u128,
    pub initial_anchor: u128,
    pub ln_fee_rate_root: i128,
    pub reserve_fee_bps: u16,
    pub tvl_cap_sy: u128,

    // Accounting
    pub sy_reserved_for_interest: u128,
    pub treasury_sy: u128,
    pub pending_refunds: LookupMap<AccountId, u128>,
}

#[near]
impl Market {
    #[init]
    pub fn new(
        owner_id: AccountId,
        treasury_id: AccountId,
        lst_id: AccountId,
        rate_source: RateSource,
        expiry_ns: u64,
        pt_name: String,
        pt_symbol: String,
        initial_index: U128,
        interest_fee_bps: Option<u16>,
        scalar_root: Option<U128>,
        initial_anchor: Option<U128>,
        ln_fee_rate_root: Option<String>,
        reserve_fee_bps: Option<u16>,
    ) -> Self {
        require!(!env::state_exists(), "Already initialized");
        require!(expiry_ns > env::block_timestamp(), "Expiry must be in the future");
        require!(initial_index.0 > 0, "Initial index must be positive");

        let fee_bps = interest_fee_bps.unwrap_or(DEFAULT_INTEREST_FEE_BPS);
        require!(fee_bps <= MAX_INTEREST_FEE_BPS, "Interest fee exceeds max allowed");

        let s_root = scalar_root.map(|s| s.0).unwrap_or(DEFAULT_SCALAR_ROOT);
        let init_anchor = initial_anchor.map(|a| a.0).unwrap_or(DEFAULT_INITIAL_ANCHOR);
        let fee_root = ln_fee_rate_root
            .map(|r| r.parse::<i128>().expect("Invalid ln_fee_rate_root"))
            .unwrap_or(DEFAULT_LN_FEE_RATE_ROOT);
        let res_fee = reserve_fee_bps.unwrap_or(DEFAULT_RESERVE_FEE_BPS);

        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: pt_name,
            symbol: pt_symbol,
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 24,
        };

        Self {
            owner_id,
            treasury_id,
            lst_id,
            rate_source,
            expiry_ns,
            interest_fee_bps: fee_bps,
            paused: false,

            py_index: initial_index.0,
            index_epoch: env::epoch_height(),
            index_updated_ns: env::block_timestamp(),
            index_at_maturity: None,

            pt: FungibleToken::new(StorageKey::FungibleToken),
            pt_metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),

            yt_balances: LookupMap::new(StorageKey::YtBalances),
            yt_total_supply: 0,
            user_interest: LookupMap::new(StorageKey::UserInterest),

            total_pt: 0,
            total_sy: 0,
            total_lp: 0,
            lp_balances: LookupMap::new(StorageKey::LpBalances),
            last_ln_implied_rate: 0,
            scalar_root: s_root,
            initial_anchor: init_anchor,
            ln_fee_rate_root: fee_root,
            reserve_fee_bps: res_fee,
            tvl_cap_sy: 0,

            sy_reserved_for_interest: 0,
            treasury_sy: 0,
            pending_refunds: LookupMap::new(StorageKey::PendingRefunds),
        }
    }

    // -------------------------------------------------------------------------
    // Internal Interest & Index Helpers
    // -------------------------------------------------------------------------

    /// Internal: Accrues YT interest for `account_id` up to the current index
    /// (capped at index_at_maturity once expired).
    fn internal_accrue_yt_interest(&mut self, account_id: &AccountId) {
        let yt_bal = self.yt_balances.get(account_id).copied().unwrap_or(0);
        let mut interest_entry = self.user_interest.get(account_id).cloned().unwrap_or(UserInterest {
            user_index: self.py_index,
            accrued_sy: 0,
        });

        let target_index = match self.index_at_maturity {
            Some(maturity_idx) => std::cmp::min(self.py_index, maturity_idx),
            None => self.py_index,
        };

        if interest_entry.user_index == 0 {
            interest_entry.user_index = target_index;
        } else if yt_bal > 0 && target_index > interest_entry.user_index {
            let (user_sy, fee_sy) = exodus_math::calc_yt_interest(
                yt_bal,
                interest_entry.user_index,
                target_index,
                self.interest_fee_bps as u32,
            );

            interest_entry.accrued_sy = interest_entry.accrued_sy.saturating_add(user_sy);
            self.sy_reserved_for_interest = self.sy_reserved_for_interest.saturating_add(user_sy);
            self.treasury_sy = self.treasury_sy.saturating_add(fee_sy);
            interest_entry.user_index = target_index;
        } else {
            interest_entry.user_index = target_index;
        }

        self.user_interest.insert(account_id.clone(), interest_entry);
    }

    /// Internal helper: transfer LST out to `receiver_id`.
    /// On failure, credits `pending_refunds`.
    fn internal_transfer_sy_out(&self, receiver_id: AccountId, amount_sy: u128) -> Promise {
        ext_lst::ext(self.lst_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(receiver_id.clone(), U128(amount_sy), None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE_FT_TRANSFER)
                    .on_ft_transfer_complete(receiver_id, U128(amount_sy)),
            )
    }

    // -------------------------------------------------------------------------
    // Core User Methods (Tokenization, Interest, Maturity)
    // -------------------------------------------------------------------------

    /// Redeems PT and YT in equal amounts for underlying LST.
    /// Can be called at any time before or after maturity.
    #[payable]
    pub fn redeem_py(&mut self, amount: U128) -> Promise {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let amount_burn = amount.0;
        require!(amount_burn > 0, "Amount must be positive");

        // Verify index freshness
        require!(
            self.index_epoch == env::epoch_height(),
            "INDEX_STALE: call refresh_index"
        );

        // 1. Accrue YT interest before balance modification
        self.internal_accrue_yt_interest(&caller);

        // 2. Check PT balance
        let pt_bal = self.pt.ft_balance_of(caller.clone()).0;
        require!(pt_bal >= amount_burn, "Insufficient PT balance");

        // 3. Check YT balance
        let yt_bal = self.yt_balances.get(&caller).copied().unwrap_or(0);
        require!(yt_bal >= amount_burn, "Insufficient YT balance");

        // 4. Burn PT
        self.pt.internal_withdraw(&caller, amount_burn);

        // 5. Burn YT
        let new_yt_bal = yt_bal - amount_burn;
        self.yt_balances.insert(caller.clone(), new_yt_bal);
        self.yt_total_supply = self.yt_total_supply.saturating_sub(amount_burn);

        // 6. Compute SY out
        let sy_out = exodus_math::redeem_py(amount_burn, self.py_index);
        require!(sy_out > 0, "Redeem amount rounds down to zero");

        events::emit_redeem_py(&caller, amount_burn, amount_burn, sy_out, self.py_index);

        // 7. Dispatch LST transfer
        self.internal_transfer_sy_out(caller, sy_out)
    }

    /// Claims accrued YT interest in LST.
    #[payable]
    pub fn claim_interest(&mut self) -> Promise {
        assert_one_yocto();
        let caller = env::predecessor_account_id();

        // 1. Accrue interest up to current state
        self.internal_accrue_yt_interest(&caller);

        // 2. Retrieve claimable amount
        let mut interest_entry = self.user_interest.get(&caller).cloned().unwrap_or_default();
        let claimable_sy = interest_entry.accrued_sy;
        require!(claimable_sy > 0, "No accrued interest to claim");

        // 3. Clear claimable balance
        interest_entry.accrued_sy = 0;
        self.user_interest.insert(caller.clone(), interest_entry);
        self.sy_reserved_for_interest = self.sy_reserved_for_interest.saturating_sub(claimable_sy);

        events::emit_claim_interest(&caller, claimable_sy, 0, self.py_index);

        // 4. Dispatch LST transfer
        self.internal_transfer_sy_out(caller, claimable_sy)
    }

    /// Redeems PT for underlying LST at or after market maturity.
    /// Each 1 PT redeems for 1 NEAR worth of LST at the current index.
    #[payable]
    pub fn redeem_pt(&mut self, amount: U128) -> Promise {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let amount_burn = amount.0;
        require!(amount_burn > 0, "Amount must be positive");

        require!(
            env::block_timestamp() >= self.expiry_ns,
            "Market has not reached maturity"
        );

        // 1. Check PT balance
        let pt_bal = self.pt.ft_balance_of(caller.clone()).0;
        require!(pt_bal >= amount_burn, "Insufficient PT balance");

        // 2. Burn PT
        self.pt.internal_withdraw(&caller, amount_burn);

        // 3. Compute SY out: amount / py_index
        let sy_out = exodus_math::redeem_pt_post_maturity(amount_burn, self.py_index);
        require!(sy_out > 0, "Redeem amount rounds down to zero");

        events::emit_redeem_pt(&caller, amount_burn, sy_out, self.py_index);

        // 4. Dispatch LST transfer
        self.internal_transfer_sy_out(caller, sy_out)
    }

    /// Sells exact PT for LST using the Pendle V2 logit curve.
    #[payable]
    pub fn swap_exact_pt_for_sy(&mut self, pt_in: U128, min_sy_out: U128) -> Promise {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let pt_amount = pt_in.0;
        require!(pt_amount > 0, "pt_in must be positive");
        require!(!self.paused, "Market is paused");
        require!(
            self.index_epoch == env::epoch_height(),
            "INDEX_STALE: call refresh_index"
        );
        let now_ns = env::block_timestamp();
        require!(
            now_ns < self.expiry_ns,
            "Market has reached maturity"
        );
        require!(self.total_lp > 0, "No liquidity in pool");

        let pt_bal = self.pt.ft_balance_of(caller.clone()).0;
        require!(pt_bal >= pt_amount, "Insufficient PT balance");

        let now_secs = now_ns / 1_000_000_000;
        let expiry_secs = self.expiry_ns / 1_000_000_000;
        let config = exodus_math::MarketAmmConfig {
            scalar_root: self.scalar_root,
            initial_anchor: self.initial_anchor,
            ln_fee_rate_root: self.ln_fee_rate_root,
            reserve_fee_bps: self.reserve_fee_bps as u32,
            expiry: expiry_secs,
        };
        let reserves = exodus_math::MarketReserves {
            total_pt: self.total_pt,
            total_sy: self.total_sy,
            last_ln_implied_rate: self.last_ln_implied_rate,
        };

        // User sells PT: d_pt is negative
        let res = exodus_math::calc_swap_pt(
            &config,
            &reserves,
            -(pt_amount as i128),
            self.py_index,
            now_secs,
        ).expect("swap execution failed");

        let sy_out = res.net_sy_to_user as u128;
        require!(sy_out >= min_sy_out.0, "Slippage: sy_out below min_sy_out");

        // Deduct PT from caller
        self.pt.internal_withdraw(&caller, pt_amount);

        // Update pool reserves
        self.total_pt = res.new_total_pt;
        self.total_sy = res.new_total_sy;
        self.last_ln_implied_rate = res.new_last_ln_implied_rate;
        self.treasury_sy = self.treasury_sy.saturating_add(res.fee_sy_to_reserve);

        events::emit_swap(&caller, "pt_sell", pt_amount, sy_out, res.fee_sy_to_reserve, self.py_index);

        self.internal_transfer_sy_out(caller, sy_out)
    }

    /// Removes liquidity pro-rata and receives PT + SY.
    /// Can be called even when paused or after maturity (user exit guarantee).
    #[payable]
    pub fn remove_liquidity(&mut self, lp: U128, min_pt_out: U128, min_sy_out: U128) -> Promise {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let lp_burn = lp.0;
        require!(lp_burn > 0, "lp must be positive");

        let user_lp = self.lp_balances.get(&caller).copied().unwrap_or(0);
        require!(user_lp >= lp_burn, "Insufficient LP balance");

        let (pt_out, sy_out) = exodus_math::calc_remove_liquidity(
            self.total_pt,
            self.total_sy,
            self.total_lp,
            lp_burn,
        ).expect("remove liquidity calculation failed");

        require!(pt_out >= min_pt_out.0, "Slippage: pt_out below min_pt_out");
        require!(sy_out >= min_sy_out.0, "Slippage: sy_out below min_sy_out");

        // Deduct LP from user & total
        self.lp_balances.insert(caller.clone(), user_lp - lp_burn);
        self.total_lp = self.total_lp.saturating_sub(lp_burn);
        self.total_pt = self.total_pt.saturating_sub(pt_out);
        self.total_sy = self.total_sy.saturating_sub(sy_out);

        // Auto-register PT for caller if needed
        if !self.pt.accounts.contains_key(&caller) {
            self.pt.internal_register_account(&caller);
        }
        self.pt.internal_deposit(&caller, pt_out);

        events::emit_remove_liquidity(&caller, lp_burn, pt_out, sy_out);

        self.internal_transfer_sy_out(caller, sy_out)
    }

    /// Internal ledger transfer for YT between accounts.
    #[payable]
    pub fn yt_transfer(&mut self, receiver_id: AccountId, amount: U128) {
        assert_one_yocto();
        let sender = env::predecessor_account_id();
        let amount_transfer = amount.0;

        require!(sender != receiver_id, "Cannot transfer YT to self");
        require!(amount_transfer > 0, "Transfer amount must be positive");

        // Accrue interest for both sides first
        self.internal_accrue_yt_interest(&sender);
        self.internal_accrue_yt_interest(&receiver_id);

        let sender_bal = self.yt_balances.get(&sender).copied().unwrap_or(0);
        require!(sender_bal >= amount_transfer, "Insufficient YT balance");

        let receiver_bal = self.yt_balances.get(&receiver_id).copied().unwrap_or(0);

        self.yt_balances.insert(sender.clone(), sender_bal - amount_transfer);
        self.yt_balances.insert(receiver_id.clone(), receiver_bal.saturating_add(amount_transfer));
    }

    /// Withdraws any failed outbound LST transfer that was credited to `pending_refunds`.
    #[payable]
    pub fn withdraw_pending(&mut self) -> Promise {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let pending = self.pending_refunds.get(&caller).copied().unwrap_or(0);
        require!(pending > 0, "No pending refunds available");

        self.pending_refunds.insert(caller.clone(), 0);
        self.internal_transfer_sy_out(caller, pending)
    }

    // -------------------------------------------------------------------------
    // Index Refresh & Keeper
    // -------------------------------------------------------------------------

    /// Public method to refresh the LST exchange rate index.
    /// Can be called by keepers, bots, or users before transactions.
    pub fn refresh_index(&mut self) -> Promise {
        let method_name = match self.rate_source {
            RateSource::Mock => "get_rate",
            RateSource::MetaPool => "get_st_near_price",
            RateSource::Linear => "ft_price",
        };

        Promise::new(self.lst_id.clone())
            .function_call(
                method_name.to_string(),
                b"{}".to_vec(),
                NearToken::from_yoctonear(0),
                GAS_FOR_RATE_QUERY,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_ON_INDEX_FETCHED)
                    .on_index_fetched(),
            )
    }

    /// Callback after querying LST contract for current exchange rate.
    #[private]
    pub fn on_index_fetched(
        &mut self,
        #[callback_result] result: Result<U128, PromiseError>,
    ) -> U128 {
        match result {
            Ok(rate_u128) => {
                // Rate is in 24 decimals; py_index is 18 decimals fixed point
                let new_index = rate_u128.0 / LST_DECIMAL_SCALE;
                if new_index > self.py_index {
                    self.py_index = new_index;
                }
                self.index_epoch = env::epoch_height();
                self.index_updated_ns = env::block_timestamp();

                // Check maturity transition
                if env::block_timestamp() >= self.expiry_ns && self.index_at_maturity.is_none() {
                    self.index_at_maturity = Some(self.py_index);
                    events::emit_market_matured(self.py_index, env::block_timestamp());
                }

                events::emit_index_updated(self.py_index, self.index_epoch);
                U128(self.py_index)
            }
            Err(_) => {
                env::panic_str("Failed to fetch exchange rate from LST contract");
            }
        }
    }

    /// Callback for outbound LST transfers.
    /// If ft_transfer fails on the LST contract, records pending refund for the receiver.
    #[private]
    pub fn on_ft_transfer_complete(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_err() {
            let current_pending = self.pending_refunds.get(&receiver_id).copied().unwrap_or(0);
            self.pending_refunds
                .insert(receiver_id, current_pending.saturating_add(amount.0));
            false
        } else {
            true
        }
    }

    // -------------------------------------------------------------------------
    // Admin & Governance Controls
    // -------------------------------------------------------------------------

    pub fn pause(&mut self) {
        self.require_owner();
        self.paused = true;
        events::emit_paused(&self.owner_id);
    }

    pub fn unpause(&mut self) {
        self.require_owner();
        self.paused = false;
        events::emit_unpaused(&self.owner_id);
    }

    pub fn set_treasury(&mut self, treasury_id: AccountId) {
        self.require_owner();
        self.treasury_id = treasury_id;
    }

    pub fn set_interest_fee_bps(&mut self, fee_bps: u16) {
        self.require_owner();
        require!(fee_bps <= MAX_INTEREST_FEE_BPS, "Fee exceeds max allowed");
        self.interest_fee_bps = fee_bps;
    }

    pub fn collect_treasury(&mut self) -> Promise {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.owner_id || caller == self.treasury_id,
            "Only owner or treasury can collect fees"
        );
        let amount = self.treasury_sy;
        require!(amount > 0, "No treasury fees available");
        self.treasury_sy = 0;
        self.internal_transfer_sy_out(self.treasury_id.clone(), amount)
    }

    fn require_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner can perform this action"
        );
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    pub fn get_market(&self) -> MarketView {
        MarketView {
            owner_id: self.owner_id.clone(),
            treasury_id: self.treasury_id.clone(),
            lst_id: self.lst_id.clone(),
            rate_source: self.rate_source,
            expiry_ns: self.expiry_ns,
            interest_fee_bps: self.interest_fee_bps,
            paused: self.paused,
            py_index: U128(self.py_index),
            index_epoch: self.index_epoch,
            index_updated_ns: self.index_updated_ns,
            index_at_maturity: self.index_at_maturity.map(U128),
            pt_total_supply: U128(self.pt.total_supply),
            yt_total_supply: U128(self.yt_total_supply),
            sy_reserved_for_interest: U128(self.sy_reserved_for_interest),
            treasury_sy: U128(self.treasury_sy),
            total_pt: U128(self.total_pt),
            total_sy: U128(self.total_sy),
            total_lp: U128(self.total_lp),
            last_ln_implied_rate: self.last_ln_implied_rate.to_string(),
        }
    }

    pub fn get_pool(&self) -> PoolView {
        PoolView {
            total_pt: U128(self.total_pt),
            total_sy: U128(self.total_sy),
            total_lp: U128(self.total_lp),
            last_ln_implied_rate: self.last_ln_implied_rate.to_string(),
            scalar_root: U128(self.scalar_root),
            ln_fee_rate_root: self.ln_fee_rate_root.to_string(),
        }
    }

    pub fn get_user(&self, account_id: AccountId) -> UserPositionView {
        let pt_balance = self.pt.ft_balance_of(account_id.clone());
        let yt_balance = self.yt_balances.get(&account_id).copied().unwrap_or(0);
        let interest = self.user_interest.get(&account_id).cloned().unwrap_or_default();
        let pending = self.pending_refunds.get(&account_id).copied().unwrap_or(0);
        let lp_balance = self.lp_balances.get(&account_id).copied().unwrap_or(0);

        UserPositionView {
            pt_balance,
            yt_balance: U128(yt_balance),
            user_index: U128(interest.user_index),
            accrued_sy: U128(interest.accrued_sy),
            pending_refund: U128(pending),
            lp_balance: U128(lp_balance),
        }
    }

    pub fn lp_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.lp_balances.get(&account_id).copied().unwrap_or(0))
    }

    pub fn preview_swap_exact_sy_for_pt(&self, sy_in: U128) -> SwapPreviewView {
        let sy_amount = sy_in.0;
        require!(sy_amount > 0, "sy_in must be positive");
        require!(self.total_lp > 0, "No liquidity in pool");
        let now_secs = env::block_timestamp() / 1_000_000_000;
        let expiry_secs = self.expiry_ns / 1_000_000_000;
        require!(now_secs < expiry_secs, "Market has expired");

        let config = exodus_math::MarketAmmConfig {
            scalar_root: self.scalar_root,
            initial_anchor: self.initial_anchor,
            ln_fee_rate_root: self.ln_fee_rate_root,
            reserve_fee_bps: self.reserve_fee_bps as u32,
            expiry: expiry_secs,
        };
        let reserves = exodus_math::MarketReserves {
            total_pt: self.total_pt,
            total_sy: self.total_sy,
            last_ln_implied_rate: self.last_ln_implied_rate,
        };

        let pt_out = exodus_math::binary_search_sy_for_pt(
            &config,
            &reserves,
            sy_amount,
            self.py_index,
            now_secs,
            None,
        ).expect("binary search failed");

        let res = exodus_math::calc_swap_pt(
            &config,
            &reserves,
            pt_out as i128,
            self.py_index,
            now_secs,
        ).expect("preview calc failed");

        SwapPreviewView {
            amount_out: U128(pt_out),
            fee_sy: U128(res.fee_sy_to_reserve),
            new_last_ln_implied_rate: res.new_last_ln_implied_rate.to_string(),
        }
    }

    pub fn preview_swap_exact_pt_for_sy(&self, pt_in: U128) -> SwapPreviewView {
        let pt_amount = pt_in.0;
        require!(pt_amount > 0, "pt_in must be positive");
        require!(self.total_lp > 0, "No liquidity in pool");
        let now_secs = env::block_timestamp() / 1_000_000_000;
        let expiry_secs = self.expiry_ns / 1_000_000_000;
        require!(now_secs < expiry_secs, "Market has expired");

        let config = exodus_math::MarketAmmConfig {
            scalar_root: self.scalar_root,
            initial_anchor: self.initial_anchor,
            ln_fee_rate_root: self.ln_fee_rate_root,
            reserve_fee_bps: self.reserve_fee_bps as u32,
            expiry: expiry_secs,
        };
        let reserves = exodus_math::MarketReserves {
            total_pt: self.total_pt,
            total_sy: self.total_sy,
            last_ln_implied_rate: self.last_ln_implied_rate,
        };

        let res = exodus_math::calc_swap_pt(
            &config,
            &reserves,
            -(pt_amount as i128),
            self.py_index,
            now_secs,
        ).expect("preview calc failed");

        let sy_out = res.net_sy_to_user as u128;
        SwapPreviewView {
            amount_out: U128(sy_out),
            fee_sy: U128(res.fee_sy_to_reserve),
            new_last_ln_implied_rate: res.new_last_ln_implied_rate.to_string(),
        }
    }

    pub fn yt_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.yt_balances.get(&account_id).copied().unwrap_or(0))
    }

    pub fn get_py_index(&self) -> U128 {
        U128(self.py_index)
    }

    pub fn version(&self) -> &'static str {
        "0.1.0"
    }
}

// -----------------------------------------------------------------------------
// FungibleTokenReceiver (Depositing LST via ft_transfer_call)
// -----------------------------------------------------------------------------

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde", tag = "action")]
pub enum TransferMsg {
    #[serde(rename = "mint_py")]
    MintPy,
    #[serde(rename = "swap_exact_sy_for_pt")]
    SwapExactSyForPt {
        min_pt_out: U128,
    },
    #[serde(rename = "add_liquidity")]
    AddLiquidity {
        pt_desired: U128,
        min_lp_out: U128,
    },
}

#[near]
impl FungibleTokenReceiver for Market {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        // Enforce incoming token is the configured LST
        require!(
            env::predecessor_account_id() == self.lst_id,
            "Only configured LST is accepted"
        );

        let parsed: Result<TransferMsg, _> = near_sdk::serde_json::from_str(&msg);
        match parsed {
            Ok(TransferMsg::MintPy) => {
                require!(!self.paused, "Market is paused");
                require!(
                    self.index_epoch == env::epoch_height(),
                    "INDEX_STALE: call refresh_index"
                );
                require!(
                    env::block_timestamp() < self.expiry_ns,
                    "Market has reached maturity"
                );

                let sy_in = amount.0;
                let (pt_out, yt_out) = exodus_math::mint_py(sy_in, self.py_index);
                require!(pt_out > 0 && yt_out > 0, "Mint amount rounds down to zero");

                // Accrue interest for sender before increasing YT balance
                self.internal_accrue_yt_interest(&sender_id);

                // Auto-register PT storage for sender if needed
                if !self.pt.accounts.contains_key(&sender_id) {
                    self.pt.internal_register_account(&sender_id);
                }

                // Deposit PT to sender
                self.pt.internal_deposit(&sender_id, pt_out);

                // Credit YT ledger
                let cur_yt = self.yt_balances.get(&sender_id).copied().unwrap_or(0);
                self.yt_balances.insert(sender_id.clone(), cur_yt.saturating_add(yt_out));
                self.yt_total_supply = self.yt_total_supply.saturating_add(yt_out);

                events::emit_mint_py(&sender_id, sy_in, pt_out, yt_out, self.py_index);

                // Return 0: all LST retained
                PromiseOrValue::Value(U128(0))
            }
            Ok(TransferMsg::SwapExactSyForPt { min_pt_out }) => {
                require!(!self.paused, "Market is paused");
                require!(
                    self.index_epoch == env::epoch_height(),
                    "INDEX_STALE: call refresh_index"
                );
                let now_ns = env::block_timestamp();
                require!(
                    now_ns < self.expiry_ns,
                    "Market has reached maturity"
                );
                require!(self.total_lp > 0, "No liquidity in pool");

                let now_secs = now_ns / 1_000_000_000;
                let expiry_secs = self.expiry_ns / 1_000_000_000;

                let config = exodus_math::MarketAmmConfig {
                    scalar_root: self.scalar_root,
                    initial_anchor: self.initial_anchor,
                    ln_fee_rate_root: self.ln_fee_rate_root,
                    reserve_fee_bps: self.reserve_fee_bps as u32,
                    expiry: expiry_secs,
                };
                let reserves = exodus_math::MarketReserves {
                    total_pt: self.total_pt,
                    total_sy: self.total_sy,
                    last_ln_implied_rate: self.last_ln_implied_rate,
                };

                let sy_in = amount.0;
                let pt_out = match exodus_math::binary_search_sy_for_pt(
                    &config,
                    &reserves,
                    sy_in,
                    self.py_index,
                    now_secs,
                    None,
                ) {
                    Ok(out) => out,
                    Err(_) => return PromiseOrValue::Value(amount),
                };

                if pt_out < min_pt_out.0 || pt_out > self.total_pt {
                    // Slippage limit not met or insufficient pool PT: refund
                    return PromiseOrValue::Value(amount);
                }

                let swap_res = match exodus_math::calc_swap_pt(
                    &config,
                    &reserves,
                    pt_out as i128,
                    self.py_index,
                    now_secs,
                ) {
                    Ok(res) => res,
                    Err(_) => return PromiseOrValue::Value(amount),
                };

                // Update pool reserves
                self.total_pt = swap_res.new_total_pt;
                self.total_sy = swap_res.new_total_sy;
                self.last_ln_implied_rate = swap_res.new_last_ln_implied_rate;
                self.treasury_sy = self.treasury_sy.saturating_add(swap_res.fee_sy_to_reserve);

                // Credit PT to sender
                if !self.pt.accounts.contains_key(&sender_id) {
                    self.pt.internal_register_account(&sender_id);
                }
                self.pt.internal_deposit(&sender_id, pt_out);

                events::emit_swap(
                    &sender_id,
                    "pt_buy",
                    sy_in,
                    pt_out,
                    swap_res.fee_sy_to_reserve,
                    self.py_index,
                );

                PromiseOrValue::Value(U128(0))
            }
            Ok(TransferMsg::AddLiquidity { pt_desired, min_lp_out }) => {
                require!(!self.paused, "Market is paused");
                require!(
                    self.index_epoch == env::epoch_height(),
                    "INDEX_STALE: call refresh_index"
                );
                let now_ns = env::block_timestamp();
                require!(
                    now_ns < self.expiry_ns,
                    "Market has reached maturity"
                );

                let sy_in = amount.0;
                let pt_bal = self.pt.ft_balance_of(sender_id.clone()).0;

                if self.total_lp == 0 {
                    // Initial liquidity deposit
                    let pt_used = pt_desired.0;
                    let sy_used = sy_in;

                    if pt_bal < pt_used {
                        return PromiseOrValue::Value(amount);
                    }

                    let lp_minted = match exodus_math::calc_initial_lp(pt_used, sy_used) {
                        Ok(lp) => lp,
                        Err(_) => return PromiseOrValue::Value(amount),
                    };

                    if lp_minted < min_lp_out.0 {
                        return PromiseOrValue::Value(amount);
                    }

                    // Withdraw PT from sender
                    self.pt.internal_withdraw(&sender_id, pt_used);

                    // Initialize reserves
                    self.total_pt = pt_used;
                    self.total_sy = sy_used;
                    self.total_lp = lp_minted.saturating_add(exodus_math::MINIMUM_LIQUIDITY);

                    // Initialize implied rate from anchor if not set
                    let now_secs = now_ns / 1_000_000_000;
                    let expiry_secs = self.expiry_ns / 1_000_000_000;
                    let tau = expiry_secs.saturating_sub(now_secs);
                    if tau > 0 && self.initial_anchor > 0 {
                        let ln_anchor = exodus_math::fp_ln(self.initial_anchor);
                        self.last_ln_implied_rate = (ln_anchor * (exodus_math::YEAR_SECONDS as i128)) / (tau as i128);
                    }

                    let cur_lp = self.lp_balances.get(&sender_id).copied().unwrap_or(0);
                    self.lp_balances.insert(sender_id.clone(), cur_lp.saturating_add(lp_minted));

                    events::emit_add_liquidity(&sender_id, pt_used, sy_used, lp_minted);

                    PromiseOrValue::Value(U128(0))
                } else {
                    // Subsequent proportional deposit
                    let (lp_minted, pt_used, sy_used) = match exodus_math::calc_add_liquidity_proportional(
                        self.total_pt,
                        self.total_sy,
                        self.total_lp,
                        pt_desired.0,
                        sy_in,
                    ) {
                        Ok(res) => res,
                        Err(_) => return PromiseOrValue::Value(amount),
                    };

                    if lp_minted < min_lp_out.0 || pt_bal < pt_used {
                        return PromiseOrValue::Value(amount);
                    }

                    // Withdraw PT from sender
                    self.pt.internal_withdraw(&sender_id, pt_used);

                    // Update reserves
                    self.total_pt = self.total_pt.saturating_add(pt_used);
                    self.total_sy = self.total_sy.saturating_add(sy_used);
                    self.total_lp = self.total_lp.saturating_add(lp_minted);

                    let cur_lp = self.lp_balances.get(&sender_id).copied().unwrap_or(0);
                    self.lp_balances.insert(sender_id.clone(), cur_lp.saturating_add(lp_minted));

                    events::emit_add_liquidity(&sender_id, pt_used, sy_used, lp_minted);

                    let unused_sy = sy_in.saturating_sub(sy_used);
                    PromiseOrValue::Value(U128(unused_sy))
                }
            }
            _ => {
                // Unknown action or invalid message: refund full amount
                PromiseOrValue::Value(amount)
            }
        }
    }
}

// -----------------------------------------------------------------------------
// PT Token Standards Implementation (NEP-141, NEP-145, NEP-148)
// -----------------------------------------------------------------------------

#[near]
impl FungibleTokenCore for Market {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.pt.ft_transfer(receiver_id, amount, memo);
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.pt.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.pt.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.pt.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Market {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, _) = self.pt.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        U128(used)
    }
}

#[near]
impl StorageManagement for Market {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.pt.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.pt.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.pt.storage_unregister(force)
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.pt.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.pt.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Market {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.pt_metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const ONE_LST: u128 = 1_000_000_000_000_000_000_000_000; // 10^24
    const ONE_INDEX: u128 = 1_000_000_000_000_000_000; // 10^18

    fn owner() -> AccountId {
        "admin.near".parse().unwrap()
    }
    fn treasury() -> AccountId {
        "treasury.near".parse().unwrap()
    }
    fn lst() -> AccountId {
        "mock-lst.near".parse().unwrap()
    }
    fn alice() -> AccountId {
        "alice.near".parse().unwrap()
    }
    fn bob() -> AccountId {
        "bob.near".parse().unwrap()
    }

    fn set_context(caller: AccountId, deposit: u128, timestamp_ns: u64, epoch: u64) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("market.near".parse().unwrap())
            .signer_account_id(caller.clone())
            .predecessor_account_id(caller)
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(timestamp_ns)
            .epoch_height(epoch);
        testing_env!(builder.build());
    }

    fn init_market(expiry_ns: u64) -> Market {
        set_context(owner(), 0, 1_000_000_000, 1);
        Market::new(
            owner(),
            treasury(),
            lst(),
            RateSource::Mock,
            expiry_ns,
            "PT Mock LST 31DEC2026".to_string(),
            "PT-MOCK".to_string(),
            U128(ONE_INDEX),
            Some(DEFAULT_INTEREST_FEE_BPS),
            None,
            None,
            None,
            None,
        )
    }

    #[test]
    fn test_market_initialization() {
        let market = init_market(2_000_000_000);
        let view = market.get_market();
        assert_eq!(view.owner_id, owner());
        assert_eq!(view.lst_id, lst());
        assert_eq!(view.py_index.0, ONE_INDEX);
        assert_eq!(view.pt_total_supply.0, 0);
        assert_eq!(view.yt_total_supply.0, 0);
        assert!(!view.paused);
    }

    #[test]
    fn test_mint_py_via_ft_on_transfer() {
        let mut market = init_market(2_000_000_000);

        // Caller must be LST contract
        set_context(lst(), 0, 1_000_000_000, 1);
        let sy_amount = 100 * ONE_LST;
        let res = market.ft_on_transfer(
            alice(),
            U128(sy_amount),
            "{\"action\":\"mint_py\"}".to_string(),
        );

        match res {
            PromiseOrValue::Value(unused) => assert_eq!(unused.0, 0),
            _ => panic!("Expected Value(0)"),
        }

        // Alice receives 100 PT and 100 YT (since index = 1.0)
        assert_eq!(market.ft_balance_of(alice()).0, 100 * ONE_LST);
        assert_eq!(market.yt_balance_of(alice()).0, 100 * ONE_LST);
        assert_eq!(market.pt.total_supply, 100 * ONE_LST);
        assert_eq!(market.yt_total_supply, 100 * ONE_LST);
    }

    #[test]
    #[should_panic(expected = "INDEX_STALE: call refresh_index")]
    fn test_mint_py_fails_on_stale_index() {
        let mut market = init_market(2_000_000_000);

        // Epoch advances from 1 to 2 without refresh_index
        set_context(lst(), 0, 1_000_000_000, 2);
        let _ = market.ft_on_transfer(
            alice(),
            U128(100 * ONE_LST),
            "{\"action\":\"mint_py\"}".to_string(),
        );
    }

    #[test]
    #[should_panic(expected = "Market is paused")]
    fn test_mint_py_fails_when_paused() {
        let mut market = init_market(2_000_000_000);

        set_context(owner(), 0, 1_000_000_000, 1);
        market.pause();
        assert!(market.paused);

        set_context(lst(), 0, 1_000_000_000, 1);
        let _ = market.ft_on_transfer(
            alice(),
            U128(100 * ONE_LST),
            "{\"action\":\"mint_py\"}".to_string(),
        );
    }

    #[test]
    fn test_yt_interest_accrual_and_claim() {
        let mut market = init_market(2_000_000_000);

        // 1. Alice deposits 100 LST at index 1.0
        set_context(lst(), 0, 1_000_000_000, 1);
        let _ = market.ft_on_transfer(
            alice(),
            U128(100 * ONE_LST),
            "{\"action\":\"mint_py\"}".to_string(),
        );

        // 2. Mock index refresh: rate bumps from 1.0 to 1.10 NEAR (1.10 * 10^18)
        set_context("market.near".parse().unwrap(), 0, 1_500_000_000, 2);
        let new_rate_24dec = 1_100_000_000_000_000_000_000_000u128;
        market.on_index_fetched(Ok(U128(new_rate_24dec)));
        assert_eq!(market.py_index, 1_100_000_000_000_000_000);
        assert_eq!(market.index_epoch, 2);

        // 3. Check Alice's position before claim
        set_context(alice(), 1, 1_500_000_000, 2);
        market.internal_accrue_yt_interest(&alice());

        let user_view = market.get_user(alice());
        // Yield expected: 100 * (1.1 - 1.0) / (1.0 * 1.1) = 100 * 0.1 / 1.1 = ~9.0909 LST
        // minus 3% fee = ~8.8181 LST
        assert!(user_view.accrued_sy.0 > 8 * ONE_LST);
        assert!(market.treasury_sy > 0);
    }

    #[test]
    fn test_yt_transfer_accrues_both_parties() {
        let mut market = init_market(2_000_000_000);

        // Alice mints 100 PY
        set_context(lst(), 0, 1_000_000_000, 1);
        let _ = market.ft_on_transfer(
            alice(),
            U128(100 * ONE_LST),
            "{\"action\":\"mint_py\"}".to_string(),
        );

        // Alice transfers 40 YT to Bob
        set_context(alice(), 1, 1_000_000_000, 1);
        market.yt_transfer(bob(), U128(40 * ONE_LST));

        assert_eq!(market.yt_balance_of(alice()).0, 60 * ONE_LST);
        assert_eq!(market.yt_balance_of(bob()).0, 40 * ONE_LST);
    }

    #[test]
    fn test_amm_add_liquidity_swap_and_remove() {
        // Expiry 90 days in future: 1_000_000_000 + 90 * 86400 * 1_000_000_000
        let expiry_ns = 1_000_000_000 + 90 * 86_400 * 1_000_000_000;
        let mut market = init_market(expiry_ns);

        // 1. Alice mints 200 PT + YT
        set_context(lst(), 0, 1_000_000_000, 1);
        let _ = market.ft_on_transfer(
            alice(),
            U128(200 * ONE_LST),
            "{\"action\":\"mint_py\"}".to_string(),
        );

        // 2. Alice adds initial liquidity: 100 PT and 100 LST
        set_context(lst(), 0, 1_000_000_000, 1);
        let init_lp_res = market.ft_on_transfer(
            alice(),
            U128(100 * ONE_LST),
            "{\"action\":\"add_liquidity\",\"pt_desired\":\"100000000000000000000000000\",\"min_lp_out\":\"1000\"}".to_string(),
        );
        match init_lp_res {
            PromiseOrValue::Value(v) => assert_eq!(v.0, 0),
            _ => panic!("Expected Value(0)"),
        }

        let pool = market.get_pool();
        assert_eq!(pool.total_pt.0, 100 * ONE_LST);
        assert_eq!(pool.total_sy.0, 100 * ONE_LST);
        assert_eq!(pool.total_lp.0, 100 * ONE_LST);
        assert_eq!(market.lp_balance_of(alice()).0, 100 * ONE_LST - 1000);

        // 3. Preview swap 10 LST for PT
        let preview = market.preview_swap_exact_sy_for_pt(U128(10 * ONE_LST));
        assert!(preview.amount_out.0 > 0);

        // 4. Bob buys PT with 10 LST
        set_context(lst(), 0, 1_000_000_000, 1);
        let buy_res = market.ft_on_transfer(
            bob(),
            U128(10 * ONE_LST),
            "{\"action\":\"swap_exact_sy_for_pt\",\"min_pt_out\":\"1000\"}".to_string(),
        );
        match buy_res {
            PromiseOrValue::Value(v) => assert_eq!(v.0, 0),
            _ => panic!("Expected Value(0)"),
        }
        let bob_pt = market.ft_balance_of(bob()).0;
        assert_eq!(bob_pt, preview.amount_out.0);

        // 5. Bob previews and sells 5 PT for LST
        let sell_preview = market.preview_swap_exact_pt_for_sy(U128(5 * ONE_LST));
        assert!(sell_preview.amount_out.0 > 0);

        set_context(bob(), 1, 1_000_000_000, 1);
        let _sell_promise = market.swap_exact_pt_for_sy(U128(5 * ONE_LST), U128(1000));
        assert_eq!(market.ft_balance_of(bob()).0, bob_pt - 5 * ONE_LST);

        // 6. Alice removes half of her LP
        let alice_lp = market.lp_balance_of(alice()).0;
        let remove_lp_amount = alice_lp / 2;
        set_context(alice(), 1, 1_000_000_000, 1);
        let _remove_promise = market.remove_liquidity(U128(remove_lp_amount), U128(1000), U128(1000));
        assert_eq!(market.lp_balance_of(alice()).0, alice_lp - remove_lp_amount);
    }
}
