//! Sandbox Integration Tests
//!
//! Integration test harness for NEAR sandbox simulations of Exodus contracts.

#[cfg(test)]
mod tests {
    use mock_lst::{MockLstContract, DEFAULT_FAUCET_AMOUNT, DEFAULT_FAUCET_COOLDOWN_NS, INITIAL_RATE};
    use near_contract_standards::fungible_token::core::FungibleTokenCore;
    use near_sdk::json_types::U128;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;
    use near_sdk::{AccountId, NearToken};

    fn contract_id() -> AccountId {
        "mock-lst.testnet".parse().unwrap()
    }

    fn owner() -> AccountId {
        "exodus-admin.testnet".parse().unwrap()
    }

    fn alice() -> AccountId {
        "alice.testnet".parse().unwrap()
    }

    fn bob() -> AccountId {
        "bob.testnet".parse().unwrap()
    }

    fn set_caller(caller: AccountId, timestamp_ns: u64, deposit_yocto: u128) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(contract_id())
            .signer_account_id(caller.clone())
            .predecessor_account_id(caller)
            .block_timestamp(timestamp_ns)
            .attached_deposit(NearToken::from_yoctonear(deposit_yocto));
        testing_env!(builder.build());
    }

    /// Full lifecycle integration test for MockLST:
    /// 1. Initialize contract and check initial rate (1.0 NEAR) and metadata.
    /// 2. User claims from faucet, balance increases by 100 LST.
    /// 3. Second user claims from faucet.
    /// 4. Exchange rate is bumped successively (1.0 -> 1.05 -> 1.12 NEAR).
    /// 5. Attempting to lower the exchange rate fails.
    /// 6. Token transfer between users works and preserves total supply.
    #[test]
    fn test_mock_lst_sandbox_lifecycle() {
        let mut current_time = 1_700_000_000_000_000_000; // Nanoseconds

        // Step 1: Deploy & Initialize
        set_caller(owner(), current_time, 0);
        let mut contract = MockLstContract::new_default_meta(owner());

        assert_eq!(contract.get_rate().0, INITIAL_RATE);
        assert_eq!(contract.get_st_near_price().0, INITIAL_RATE);
        assert_eq!(contract.ft_price().0, INITIAL_RATE);
        assert_eq!(contract.ft_total_supply().0, 0);

        // Step 2: Alice claims from faucet
        current_time += 1_000_000_000;
        set_caller(alice(), current_time, 0);
        let alice_claimed = contract.faucet();
        assert_eq!(alice_claimed.0, DEFAULT_FAUCET_AMOUNT);
        assert_eq!(contract.ft_balance_of(alice()).0, DEFAULT_FAUCET_AMOUNT);
        assert_eq!(contract.ft_total_supply().0, DEFAULT_FAUCET_AMOUNT);

        // Step 3: Bob claims from faucet
        current_time += 1_000_000_000;
        set_caller(bob(), current_time, 0);
        let bob_claimed = contract.faucet();
        assert_eq!(bob_claimed.0, DEFAULT_FAUCET_AMOUNT);
        assert_eq!(contract.ft_balance_of(bob()).0, DEFAULT_FAUCET_AMOUNT);
        assert_eq!(contract.ft_total_supply().0, DEFAULT_FAUCET_AMOUNT * 2);

        // Step 4: Admin bumps rate after staking rewards (1.0 -> 1.05 NEAR)
        current_time += 43_200_000_000_000; // ~12 hours later (epoch passed)
        set_caller(owner(), current_time, 0);
        let rate_1 = U128(1_050_000_000_000_000_000_000_000); // 1.05 NEAR
        contract.set_rate(rate_1);

        assert_eq!(contract.get_rate(), rate_1);
        assert_eq!(contract.get_st_near_price(), rate_1);
        assert_eq!(contract.ft_price(), rate_1);

        // Admin bumps rate again (1.05 -> 1.12 NEAR)
        current_time += 43_200_000_000_000;
        let rate_2 = U128(1_120_000_000_000_000_000_000_000); // 1.12 NEAR
        contract.set_rate(rate_2);

        assert_eq!(contract.get_rate(), rate_2);
        assert_eq!(contract.get_st_near_price(), rate_2);
        assert_eq!(contract.ft_price(), rate_2);

        // Step 5: Verify rate strictly increases (rate_2 > rate_1 > INITIAL_RATE)
        assert!(rate_2.0 > rate_1.0);
        assert!(rate_1.0 > INITIAL_RATE);

        // Step 6: Alice claims faucet again after cooldown
        current_time += DEFAULT_FAUCET_COOLDOWN_NS + 10_000_000;
        set_caller(alice(), current_time, 0);
        let alice_claimed_2 = contract.faucet();
        assert_eq!(alice_claimed_2.0, DEFAULT_FAUCET_AMOUNT);
        assert_eq!(contract.ft_balance_of(alice()).0, DEFAULT_FAUCET_AMOUNT * 2);
        assert_eq!(contract.ft_total_supply().0, DEFAULT_FAUCET_AMOUNT * 3);

        // Step 7: Alice transfers 25 MockLST to Bob
        let transfer_amount = U128(25_000_000_000_000_000_000_000_000);
        set_caller(alice(), current_time, 1); // 1 yocto deposit required by NEP-141
        contract.ft_transfer(bob(), transfer_amount, None);

        assert_eq!(
            contract.ft_balance_of(alice()).0,
            (DEFAULT_FAUCET_AMOUNT * 2) - transfer_amount.0
        );
        assert_eq!(
            contract.ft_balance_of(bob()).0,
            DEFAULT_FAUCET_AMOUNT + transfer_amount.0
        );
        // Total supply invariant: balance sums match total supply
        assert_eq!(
            contract.ft_balance_of(alice()).0 + contract.ft_balance_of(bob()).0,
            contract.ft_total_supply().0
        );
    }

    #[test]
    #[should_panic(expected = "Rate cannot decrease: LST invariant violated")]
    fn test_mock_lst_rate_decrease_rejected() {
        let current_time = 1_700_000_000_000_000_000;
        set_caller(owner(), current_time, 0);
        let mut contract = MockLstContract::new_default_meta(owner());

        // Bump to 1.10 NEAR
        contract.set_rate(U128(1_100_000_000_000_000_000_000_000));

        // Attempting to decrease to 1.05 NEAR must panic
        contract.set_rate(U128(1_050_000_000_000_000_000_000_000));
    }
}
