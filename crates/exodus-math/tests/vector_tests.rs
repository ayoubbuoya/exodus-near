use exodus_math::{
    calc_rate_scalar, calc_yt_interest, fp_exp, fp_ln, mint_py, redeem_py,
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct TestVectors {
    tokenization: Vec<TokenizationVector>,
    interest: Vec<InterestVector>,
    log_exp: Vec<LogExpVector>,
    amm_checks: Vec<AmmVector>,
}

#[derive(Debug, Deserialize)]
struct TokenizationVector {
    sy_in: String,
    py_index: String,
    expected_pt_out: String,
    expected_yt_out: String,
    expected_redeem_sy: String,
}

#[derive(Debug, Deserialize)]
struct InterestVector {
    yt_balance: String,
    user_index: String,
    new_index: String,
    fee_bps: u32,
    expected_user_sy: String,
    expected_fee_sy: String,
}

#[derive(Debug, Deserialize)]
struct LogExpVector {
    r#type: String,
    input: String,
    expected: String,
}

#[derive(Debug, Deserialize)]
struct AmmVector {
    tau: u64,
    scalar_root: String,
    expected_rate_scalar: String,
    last_ln_implied_rate: String,
    expected_er_last: String,
}

#[test]
fn test_against_reference_vectors() {
    let raw_json = include_str!("../../../scripts/test_vectors.json");
    let vectors: TestVectors = serde_json::from_str(raw_json).expect("valid test_vectors.json");

    // 1. Verify Tokenization vectors
    for tc in &vectors.tokenization {
        let sy_in: u128 = tc.sy_in.parse().unwrap();
        let py_index: u128 = tc.py_index.parse().unwrap();
        let (pt_out, yt_out) = mint_py(sy_in, py_index);

        assert_eq!(pt_out.to_string(), tc.expected_pt_out);
        assert_eq!(yt_out.to_string(), tc.expected_yt_out);

        let redeem_sy = redeem_py(pt_out, py_index);
        assert_eq!(redeem_sy.to_string(), tc.expected_redeem_sy);
    }

    // 2. Verify Interest vectors
    for tc in &vectors.interest {
        let yt_bal: u128 = tc.yt_balance.parse().unwrap();
        let u_idx: u128 = tc.user_index.parse().unwrap();
        let n_idx: u128 = tc.new_index.parse().unwrap();
        let (user_sy, fee_sy) = calc_yt_interest(yt_bal, u_idx, n_idx, tc.fee_bps);

        assert_eq!(user_sy.to_string(), tc.expected_user_sy);
        assert_eq!(fee_sy.to_string(), tc.expected_fee_sy);
    }

    // 3. Verify Log/Exp vectors
    for tc in &vectors.log_exp {
        let input: i128 = tc.input.parse().unwrap();
        let expected: i128 = tc.expected.parse().unwrap();

        if tc.r#type == "ln" {
            let actual = fp_ln(input as u128);
            let diff = (actual - expected).abs();
            assert!(
                diff <= 20,
                "ln diff too large: input={}, actual={}, expected={}, diff={}",
                input,
                actual,
                expected,
                diff
            );
        } else if tc.r#type == "exp" {
            let actual = fp_exp(input) as i128;
            let diff = (actual - expected).abs();
            assert!(
                diff <= 100,
                "exp diff too large: input={}, actual={}, expected={}, diff={}",
                input,
                actual,
                expected,
                diff
            );
        }
    }

    // 4. Verify AMM checks
    for tc in &vectors.amm_checks {
        let scalar_root: u128 = tc.scalar_root.parse().unwrap();
        let rate_scalar = calc_rate_scalar(scalar_root, tc.tau).unwrap();
        assert_eq!(rate_scalar.to_string(), tc.expected_rate_scalar);

        let last_ln_rate: i128 = tc.last_ln_implied_rate.parse().unwrap();
        let exponent = (last_ln_rate * (tc.tau as i128)) / (31_536_000 as i128);
        let er_last = fp_exp(exponent);
        let expected_er: u128 = tc.expected_er_last.parse().unwrap();
        let diff = (er_last as i128 - expected_er as i128).abs();
        assert!(diff <= 5, "er_last diff too large: {}", diff);
    }
}
