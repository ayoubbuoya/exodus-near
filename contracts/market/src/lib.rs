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
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct UserPositionView {
    pub pt_balance: U128,
    pub yt_balance: U128,
    pub user_index: U128,
    pub accrued_sy: U128,
    pub pending_refund: U128,
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

    // AMM placeholders for Step 6
    pub total_pt: u128,
    pub total_sy: u128,
    pub total_lp: u128,
    pub lp_balances: LookupMap<AccountId, u128>,
    pub last_ln_implied_rate: i128,
    pub scalar_root: i128,
    pub initial_anchor: i128,
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
    ) -> Self {
        require!(!env::state_exists(), "Already initialized");
        require!(expiry_ns > env::block_timestamp(), "Expiry must be in the future");
        require!(initial_index.0 > 0, "Initial index must be positive");

        let fee_bps = interest_fee_bps.unwrap_or(DEFAULT_INTEREST_FEE_BPS);
        require!(fee_bps <= MAX_INTEREST_FEE_BPS, "Interest fee exceeds max allowed");

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
            scalar_root: 0,
            initial_anchor: 0,
            ln_fee_rate_root: 0,
            reserve_fee_bps: 2000,
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
        }
    }

    pub fn get_user(&self, account_id: AccountId) -> UserPositionView {
        let pt_balance = self.pt.ft_balance_of(account_id.clone());
        let yt_balance = self.yt_balances.get(&account_id).copied().unwrap_or(0);
        let interest = self.user_interest.get(&account_id).cloned().unwrap_or_default();
        let pending = self.pending_refunds.get(&account_id).copied().unwrap_or(0);

        UserPositionView {
            pt_balance,
            yt_balance: U128(yt_balance),
            user_index: U128(interest.user_index),
            accrued_sy: U128(interest.accrued_sy),
            pending_refund: U128(pending),
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
#[serde(crate = "near_sdk::serde")]
struct MintPyMsg {
    action: String,
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

        let parsed: Result<MintPyMsg, _> = near_sdk::serde_json::from_str(&msg);
        match parsed {
            Ok(MintPyMsg { action }) if action == "mint_py" => {
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
}
