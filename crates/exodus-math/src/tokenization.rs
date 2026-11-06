//! Tokenization math for minting and redeeming PT and YT.
//!
//! PT and YT are always issued in 1:1 proportion against deposited SY (LST).
//! At index I, 1 SY = I asset units (NEAR).
//! Therefore, depositing `sy_in` yields `sy_in * I` PT and `sy_in * I` YT.

use crate::fixed_point::{fp_div, fp_mul};

/// Converts SY (LST) amount to NEAR asset value at the given exchange rate index.
#[inline]
pub fn sy_to_asset(sy_amount: u128, py_index: u128) -> u128 {
    fp_mul(sy_amount, py_index)
}

/// Converts NEAR asset value to SY (LST) amount at the given exchange rate index.
#[inline]
pub fn asset_to_sy(asset_amount: u128, py_index: u128) -> u128 {
    fp_div(asset_amount, py_index)
}

/// Computes the PT and YT output from depositing `sy_in` at `py_index`.
/// Returns `(pt_out, yt_out)`.
pub fn mint_py(sy_in: u128, py_index: u128) -> (u128, u128) {
    let pt_out = sy_to_asset(sy_in, py_index);
    let yt_out = pt_out;
    (pt_out, yt_out)
}

/// Computes the SY returned when burning `amount` of PT and YT simultaneously.
pub fn redeem_py(amount: u128, py_index: u128) -> u128 {
    asset_to_sy(amount, py_index)
}

/// Computes the SY returned when redeeming PT after market maturity at `py_index`.
pub fn redeem_pt_post_maturity(pt_amount: u128, py_index: u128) -> u128 {
    asset_to_sy(pt_amount, py_index)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixed_point::FP_ONE;

    #[test]
    fn test_mint_py_example() {
        // 100 LST (24 dec) at index 1.30 (18 dec) -> 130 PT (24 dec) + 130 YT (24 dec)
        let sy_in = 100 * 10u128.pow(24);
        let py_index = (130 * FP_ONE) / 100;
        let (pt_out, yt_out) = mint_py(sy_in, py_index);
        assert_eq!(pt_out, 130 * 10u128.pow(24));
        assert_eq!(yt_out, 130 * 10u128.pow(24));

        let sy_redeemed = redeem_py(pt_out, py_index);
        assert_eq!(sy_redeemed, sy_in);
    }
}
