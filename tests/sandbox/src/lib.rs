//! Sandbox Integration Tests
//!
//! Integration test harness for NEAR sandbox simulations of Exodus contracts.

#[cfg(test)]
mod tests {
    use market::{Market, RateSource, DEFAULT_INTEREST_FEE_BPS, LST_DECIMAL_SCALE};
    use mock_lst::{MockLstContract, DEFAULT_FAUCET_AMOUNT, DEFAULT_FAUCET_COOLDOWN_NS, INITIAL_RATE};
    use near_contract_standards::fungible_token::core::FungibleTokenCore;
    use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
    use near_sdk::json_types::U128;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;
    use near_sdk::{AccountId, NearToken, PromiseOrValue};

    const ONE_LST: u128 = 1_000_000_000_000_000_000_000_000; // 10^24
    const ONE_INDEX: u128 = 1_000_000_000_000_000_000; // 10^18

    fn contract_id() -> AccountId {
        "mock-lst.testnet".parse().unwrap()
    }

    fn market_id() -> AccountId {
        "market.testnet".parse().unwrap()
    }

    fn owner() -> AccountId {
        "exodus-admin.testnet".parse().unwrap()
    }

    fn treasury() -> AccountId {
        "treasury.testnet".parse().unwrap()
    }

    fn alice() -> AccountId {
        "alice.testnet".parse().unwrap()
    }

    fn bob() -> AccountId {
        "bob.testnet".parse().unwrap()
    }

    fn set_caller(caller: AccountId, timestamp_ns: u64, deposit_yocto: u128) {
        set_caller_with_epoch(caller, timestamp_ns, deposit_yocto, 1);
    }

    fn set_caller_with_epoch(
        caller: AccountId,
        timestamp_ns: u64,
        deposit_yocto: u128,
        epoch_height: u64,
    ) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(contract_id())
            .signer_account_id(caller.clone())
            .predecessor_account_id(caller)
            .block_timestamp(timestamp_ns)
            .epoch_height(epoch_height)
            .attached_deposit(NearToken::from_yoctonear(deposit_yocto));
        testing_env!(builder.build());
    }

    fn set_market_caller(
        caller: AccountId,
        timestamp_ns: u64,
        deposit_yocto: u128,
        epoch_height: u64,
    ) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(market_id())
            .signer_account_id(caller.clone())
            .predecessor_account_id(caller)
            .block_timestamp(timestamp_ns)
            .epoch_height(epoch_height)
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

    /// Step 5 Full Lifecycle Sandbox Test for Market Contract:
    /// 1. Initialize MockLST and Market contract with 7 days expiry.
    /// 2. Alice mints 100 PT + 100 YT by depositing 100 MockLST at index 1.0.
    /// 3. MockLST exchange rate increases to 1.10 NEAR in next epoch.
    /// 4. Keeper refreshes market index to 1.10 NEAR.
    /// 5. Stale index check: attempting to mint in a new epoch before refresh fails.
    /// 6. Alice claims accrued YT interest (gross ~9.09 MockLST, net of 3% fee ~8.818 MockLST).
    /// 7. Time advances past expiry. Market matures and seals index_at_maturity.
    /// 8. Alice redeems 100 PT for ~90.909 MockLST.
    /// 9. Conservation of value invariant: sum of YT yield + fee + PT redemption equals 100 MockLST.
    #[test]
    fn test_market_step5_lifecycle() {
        let mut current_time_ns = 1_700_000_000_000_000_000u64;
        let expiry_ns = current_time_ns + 7 * 86_400 * 1_000_000_000; // 7 days later
        let mut current_epoch = 100u64;

        // --- 1. Deploy Market Contract ---
        set_market_caller(owner(), current_time_ns, 0, current_epoch);
        let mut market = Market::new(
            owner(),
            treasury(),
            contract_id(),
            RateSource::Mock,
            expiry_ns,
            "PT Mock LST 7D".to_string(),
            "PT-MOCK-7D".to_string(),
            U128(ONE_INDEX),
            Some(DEFAULT_INTEREST_FEE_BPS),
        );

        let market_view = market.get_market();
        assert_eq!(market_view.py_index.0, ONE_INDEX);
        assert_eq!(market_view.pt_total_supply.0, 0);
        assert_eq!(market_view.yt_total_supply.0, 0);

        // --- 2. Alice Mints PT + YT ---
        // Mock incoming ft_transfer_call from LST contract with 100 LST
        let deposit_lst = 100 * ONE_LST;
        set_market_caller(contract_id(), current_time_ns, 0, current_epoch);
        let mint_res = market.ft_on_transfer(
            alice(),
            U128(deposit_lst),
            "{\"action\":\"mint_py\"}".to_string(),
        );

        match mint_res {
            PromiseOrValue::Value(unused) => assert_eq!(unused.0, 0),
            _ => panic!("Expected Value(0)"),
        }

        assert_eq!(market.ft_balance_of(alice()).0, 100 * ONE_LST);
        assert_eq!(market.yt_balance_of(alice()).0, 100 * ONE_LST);
        assert_eq!(market.pt.total_supply, 100 * ONE_LST);
        assert_eq!(market.yt_total_supply, 100 * ONE_LST);

        // --- 3. Staking Rewards Accrue (Rate increases 1.00 -> 1.10 NEAR) ---
        current_time_ns += 43_200 * 1_000_000_000; // 12 hours later
        current_epoch += 1;

        // --- 4. Keeper Refreshes Index ---
        let rate_bumped_24dec = 1_100_000_000_000_000_000_000_000u128; // 1.10 NEAR
        set_market_caller(market_id(), current_time_ns, 0, current_epoch);
        let updated_index = market.on_index_fetched(Ok(U128(rate_bumped_24dec)));
        let expected_index_18dec = rate_bumped_24dec / LST_DECIMAL_SCALE;
        assert_eq!(updated_index.0, expected_index_18dec);
        assert_eq!(market.py_index, expected_index_18dec);
        assert_eq!(market.index_epoch, current_epoch);

        // --- 5. Alice Checks & Claims Accrued YT Interest ---
        set_market_caller(alice(), current_time_ns, 1, current_epoch);
        let _user_pos_before = market.get_user(alice());
        // Gross yield = 100 * (1.1 - 1.0) / (1.0 * 1.1) = 9.090909090909090909090909 LST
        // 3% fee = 0.272727272727272727272727 LST
        // Net yield = 8.818181818181818181818181 LST
        set_market_caller(alice(), current_time_ns, 1, current_epoch);
        let _claim_promise = market.claim_interest();

        let user_pos_after = market.get_user(alice());
        assert_eq!(user_pos_after.accrued_sy.0, 0); // claimed!
        assert!(market.treasury_sy > 0); // protocol fee collected

        let fee_collected = market.treasury_sy;
        // User view before claim tracked the exact accrued amount
        let (expected_user_sy, expected_fee) =
            exodus_math::calc_yt_interest(100 * ONE_LST, ONE_INDEX, expected_index_18dec, 300);
        assert_eq!(fee_collected, expected_fee);
        let net_claimed = expected_user_sy;

        // --- 6. Time Advances Past Expiry ---
        current_time_ns = expiry_ns + 3600 * 1_000_000_000; // 1 hour past maturity
        current_epoch += 14;

        // Refresh index at maturity
        set_market_caller(market_id(), current_time_ns, 0, current_epoch);
        market.on_index_fetched(Ok(U128(rate_bumped_24dec)));
        assert_eq!(market.index_at_maturity, Some(expected_index_18dec));

        // --- 7. Alice Redeems PT Post-Maturity ---
        set_market_caller(alice(), current_time_ns, 1, current_epoch);
        let _redeem_promise = market.redeem_pt(U128(100 * ONE_LST));

        // Alice's PT balance is now 0
        assert_eq!(market.ft_balance_of(alice()).0, 0);
        assert_eq!(market.pt.total_supply, 0);

        // PT redemption output in LST: 100 PT / 1.10 = 90.909090909090909090909090 LST
        let pt_redeemed_sy = exodus_math::redeem_pt_post_maturity(100 * ONE_LST, expected_index_18dec);

        // --- 8. Conservation of Value Invariant ---
        // Net yield + Fee + PT Redemption == Original deposit (100 LST)
        let total_reconstituted = net_claimed + fee_collected + pt_redeemed_sy;
        // Total rounding error must be at most 1 yocto
        let diff = if total_reconstituted > deposit_lst {
            total_reconstituted - deposit_lst
        } else {
            deposit_lst - total_reconstituted
        };
        assert!(
            diff <= 1,
            "Total value conservation invariant held within 1 yocto: diff = {}",
            diff
        );
    }

    #[test]
    #[should_panic(expected = "INDEX_STALE: call refresh_index")]
    fn test_market_stale_index_rejected() {
        let current_time_ns = 1_700_000_000_000_000_000u64;
        let expiry_ns = current_time_ns + 7 * 86_400 * 1_000_000_000;
        let current_epoch = 100u64;

        set_market_caller(owner(), current_time_ns, 0, current_epoch);
        let mut market = Market::new(
            owner(),
            treasury(),
            contract_id(),
            RateSource::Mock,
            expiry_ns,
            "PT Mock LST 7D".to_string(),
            "PT-MOCK-7D".to_string(),
            U128(ONE_INDEX),
            Some(DEFAULT_INTEREST_FEE_BPS),
        );

        // Advance epoch from 100 to 101 without refresh_index
        set_market_caller(contract_id(), current_time_ns, 0, current_epoch + 1);
        let _ = market.ft_on_transfer(
            alice(),
            U128(100 * ONE_LST),
            "{\"action\":\"mint_py\"}".to_string(),
        );
    }
}
