//! exodus-math
//!
//! Pure Rust fixed-point math engine for Exodus on NEAR.
//! Handles fixed-point arithmetic (18 decimals), logit AMM curve calculations,
//! and interest rate accruals.

#![allow(dead_code)]

/// Number of decimals used in fixed-point operations (1e18).
pub const FP_DECIMALS: u32 = 18;
pub const FP_ONE: u128 = 1_000_000_000_000_000_000;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fp_one_constant() {
        assert_eq!(FP_ONE, 10u128.pow(FP_DECIMALS));
    }
}
