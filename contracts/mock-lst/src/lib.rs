use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue,
};

/// 24 decimals: 1 MockLST = 10^24 yoctoNEAR initially (1.0 NEAR).
pub const INITIAL_RATE: u128 = 1_000_000_000_000_000_000_000_000;

/// Default faucet drip: 100 MockLST (in 24 decimals).
pub const DEFAULT_FAUCET_AMOUNT: u128 = 100_000_000_000_000_000_000_000_000;

/// Default faucet cooldown: 60 seconds (in nanoseconds).
pub const DEFAULT_FAUCET_COOLDOWN_NS: u64 = 60_000_000_000;

#[near]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    FungibleToken,
    Metadata,
    FaucetClaims,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockLstContract {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    pub owner_id: AccountId,
    pub rate: U128,
    pub faucet_amount: U128,
    pub faucet_cooldown_ns: u64,
    pub last_faucet_claim: LookupMap<AccountId, u64>,
}

#[near]
impl MockLstContract {
    #[init]
    pub fn new_default_meta(owner_id: AccountId) -> Self {
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Mock Liquid Staking NEAR (DEMO)".to_string(),
            symbol: "stNEAR-DEMO".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 24,
        };

        Self {
            token: FungibleToken::new(StorageKey::FungibleToken),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            owner_id,
            rate: U128(INITIAL_RATE),
            faucet_amount: U128(DEFAULT_FAUCET_AMOUNT),
            faucet_cooldown_ns: DEFAULT_FAUCET_COOLDOWN_NS,
            last_faucet_claim: LookupMap::new(StorageKey::FaucetClaims),
        }
    }

    /// Returns the exchange rate in 24 decimals (yoctoNEAR per LST).
    pub fn get_rate(&self) -> U128 {
        self.rate
    }

    /// Compatibility alias for Meta Pool: `meta-pool.near get_st_near_price`.
    pub fn get_st_near_price(&self) -> U128 {
        self.rate
    }

    /// Compatibility alias for LiNEAR: `linear-protocol.near ft_price`.
    pub fn ft_price(&self) -> U128 {
        self.rate
    }

    /// Bumps the exchange rate. Only the owner can call this.
    /// Invariant: The exchange rate can only increase, never decrease.
    pub fn set_rate(&mut self, new_rate: U128) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner can update the rate"
        );
        require!(
            new_rate.0 >= self.rate.0,
            "Rate cannot decrease: LST invariant violated"
        );
        let old_rate = self.rate;
        self.rate = new_rate;
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"mock-lst\",\"version\":\"1.0.0\",\"event\":\"rate_bump\",\"data\":[{{\"old_rate\":\"{}\",\"new_rate\":\"{}\"}}]}}",
            old_rate.0, new_rate.0
        ));
    }

    /// Mint tokens to an account. Only the owner can call this.
    /// Automatically registers the recipient's storage if not already registered.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner can mint tokens"
        );
        if !self.token.accounts.contains_key(&account_id) {
            self.token.internal_register_account(&account_id);
        }
        self.token.internal_deposit(&account_id, amount.into());
    }

    /// Public faucet: allows any account to claim a fixed amount of test tokens.
    /// Rate-limited per account by `faucet_cooldown_ns`.
    pub fn faucet(&mut self) -> U128 {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();

        if let Some(last_claim) = self.last_faucet_claim.get(&caller) {
            require!(
                now >= last_claim + self.faucet_cooldown_ns,
                "Faucet cooldown has not expired yet"
            );
        }

        self.last_faucet_claim.insert(caller.clone(), now);

        if !self.token.accounts.contains_key(&caller) {
            self.token.internal_register_account(&caller);
        }
        self.token
            .internal_deposit(&caller, self.faucet_amount.into());

        self.faucet_amount
    }
}

#[near]
impl FungibleTokenCore for MockLstContract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo);
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for MockLstContract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        self.token
            .ft_resolve_transfer(sender_id, receiver_id, amount)
    }
}

#[near]
impl StorageManagement for MockLstContract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.storage_unregister(force)
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for MockLstContract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn owner() -> AccountId {
        "owner.near".parse().unwrap()
    }

    fn alice() -> AccountId {
        "alice.near".parse().unwrap()
    }

    fn bob() -> AccountId {
        "bob.near".parse().unwrap()
    }

    fn contract_id() -> AccountId {
        "mock-lst.near".parse().unwrap()
    }

    fn setup_context(predecessor: AccountId, block_timestamp: u64) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(contract_id())
            .signer_account_id(predecessor.clone())
            .predecessor_account_id(predecessor)
            .block_timestamp(block_timestamp);
        testing_env!(builder.build());
    }

    #[test]
    fn test_init_and_metadata() {
        setup_context(owner(), 1_000_000_000);
        let contract = MockLstContract::new_default_meta(owner());

        assert_eq!(contract.get_rate().0, INITIAL_RATE);
        assert_eq!(contract.get_st_near_price().0, INITIAL_RATE);
        assert_eq!(contract.ft_price().0, INITIAL_RATE);

        let meta = contract.ft_metadata();
        assert_eq!(meta.name, "Mock Liquid Staking NEAR (DEMO)");
        assert_eq!(meta.symbol, "stNEAR-DEMO");
        assert_eq!(meta.decimals, 24);
        assert_eq!(contract.ft_total_supply().0, 0);
    }

    #[test]
    fn test_set_rate_increasing_success() {
        setup_context(owner(), 1_000_000_000);
        let mut contract = MockLstContract::new_default_meta(owner());

        let new_rate = U128(1_100_000_000_000_000_000_000_000); // 1.10 NEAR
        contract.set_rate(new_rate);
        assert_eq!(contract.get_rate(), new_rate);
        assert_eq!(contract.get_st_near_price(), new_rate);
        assert_eq!(contract.ft_price(), new_rate);

        let higher_rate = U128(1_250_000_000_000_000_000_000_000); // 1.25 NEAR
        contract.set_rate(higher_rate);
        assert_eq!(contract.get_rate(), higher_rate);
    }

    #[test]
    #[should_panic(expected = "Rate cannot decrease: LST invariant violated")]
    fn test_set_rate_decreasing_fails() {
        setup_context(owner(), 1_000_000_000);
        let mut contract = MockLstContract::new_default_meta(owner());

        let lower_rate = U128(900_000_000_000_000_000_000_000); // 0.90 NEAR
        contract.set_rate(lower_rate);
    }

    #[test]
    #[should_panic(expected = "Only the owner can update the rate")]
    fn test_set_rate_unauthorized() {
        setup_context(owner(), 1_000_000_000);
        let mut contract = MockLstContract::new_default_meta(owner());

        setup_context(alice(), 1_000_000_000);
        contract.set_rate(U128(1_200_000_000_000_000_000_000_000));
    }

    #[test]
    fn test_owner_mint() {
        setup_context(owner(), 1_000_000_000);
        let mut contract = MockLstContract::new_default_meta(owner());

        let mint_amount = U128(500_000_000_000_000_000_000_000_000); // 500 MockLST
        contract.mint(alice(), mint_amount);

        assert_eq!(contract.ft_balance_of(alice()), mint_amount);
        assert_eq!(contract.ft_total_supply(), mint_amount);
    }

    #[test]
    #[should_panic(expected = "Only the owner can mint tokens")]
    fn test_mint_unauthorized() {
        setup_context(owner(), 1_000_000_000);
        let mut contract = MockLstContract::new_default_meta(owner());

        setup_context(alice(), 1_000_000_000);
        contract.mint(alice(), U128(100));
    }

    #[test]
    fn test_faucet_drip_and_cooldown() {
        let start_time = 1_000_000_000_000;
        setup_context(owner(), start_time);
        let mut contract = MockLstContract::new_default_meta(owner());

        // Alice claims from faucet
        setup_context(alice(), start_time);
        let claimed = contract.faucet();
        assert_eq!(claimed.0, DEFAULT_FAUCET_AMOUNT);
        assert_eq!(contract.ft_balance_of(alice()).0, DEFAULT_FAUCET_AMOUNT);

        // Bob claims from faucet independently
        setup_context(bob(), start_time + 1_000);
        let claimed_bob = contract.faucet();
        assert_eq!(claimed_bob.0, DEFAULT_FAUCET_AMOUNT);
        assert_eq!(contract.ft_balance_of(bob()).0, DEFAULT_FAUCET_AMOUNT);

        // Total supply should now be 200 MockLST
        assert_eq!(contract.ft_total_supply().0, DEFAULT_FAUCET_AMOUNT * 2);

        // Alice claims again after cooldown expires (60 seconds + 1 nanosecond later)
        let after_cooldown = start_time + DEFAULT_FAUCET_COOLDOWN_NS + 1;
        setup_context(alice(), after_cooldown);
        let claimed2 = contract.faucet();
        assert_eq!(claimed2.0, DEFAULT_FAUCET_AMOUNT);
        assert_eq!(contract.ft_balance_of(alice()).0, DEFAULT_FAUCET_AMOUNT * 2);
    }

    #[test]
    #[should_panic(expected = "Faucet cooldown has not expired yet")]
    fn test_faucet_cooldown_rejection() {
        let start_time = 1_000_000_000_000;
        setup_context(owner(), start_time);
        let mut contract = MockLstContract::new_default_meta(owner());

        setup_context(alice(), start_time);
        contract.faucet();

        // Immediate second call should panic
        contract.faucet();
    }

    #[test]
    fn test_ft_transfer() {
        let start_time = 1_000_000_000_000;
        setup_context(owner(), start_time);
        let mut contract = MockLstContract::new_default_meta(owner());

        // Alice claims 100 MockLST
        setup_context(alice(), start_time);
        contract.faucet();

        // Register Bob for storage deposit
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(contract_id())
            .signer_account_id(bob())
            .predecessor_account_id(bob())
            .attached_deposit(NearToken::from_yoctonear(10_000_000_000_000_000_000_000)); // 0.01 NEAR
        testing_env!(builder.build());
        contract.storage_deposit(Some(bob()), None);

        // Alice transfers 40 MockLST to Bob (attached 1 yocto deposit)
        let transfer_amount = U128(40_000_000_000_000_000_000_000_000);
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(contract_id())
            .signer_account_id(alice())
            .predecessor_account_id(alice())
            .attached_deposit(NearToken::from_yoctonear(1));
        testing_env!(builder.build());

        contract.ft_transfer(bob(), transfer_amount, None);

        assert_eq!(
            contract.ft_balance_of(alice()).0,
            DEFAULT_FAUCET_AMOUNT - transfer_amount.0
        );
        assert_eq!(contract.ft_balance_of(bob()), transfer_amount);
    }
}
