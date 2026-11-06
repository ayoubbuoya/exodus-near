//! Yield Token (YT) interest accrual and fee calculation.
//!
//! As the LST exchange rate index grows, YT holders accrue the underlying yield.
//! Accrual runs before any balance update and on claim:
//!
//! interest_sy = yt_balance * (I_new - user_index) / (user_index * I_new)
//! fee_sy      = interest_sy * fee_bps / 10_000
//! user_sy     = interest_sy - fee_sy

use crate::fixed_point::{fp_mul, mul_div_down};

/// Computes accrued interest and protocol fee in SY for a given YT balance.
///
/// Returns `(user_interest_sy, protocol_fee_sy)`.
pub fn calc_yt_interest(
    yt_balance: u128,
    last_user_index: u128,
    current_index: u128,
    fee_bps: u32,
) -> (u128, u128) {
    if yt_balance == 0 || current_index <= last_user_index || last_user_index == 0 {
        return (0, 0);
    }

    let delta_index = current_index - last_user_index;
    let denom = fp_mul(last_user_index, current_index);
    if denom == 0 {
        return (0, 0);
    }

    // interest_sy = (yt_balance * delta_index) / denom
    let total_interest_sy = match mul_div_down(yt_balance, delta_index, denom) {
        Some(val) => val,
        None => return (0, 0),
    };

    let fee_sy = (total_interest_sy * fee_bps as u128) / 10_000;
    let user_interest_sy = total_interest_sy.saturating_sub(fee_sy);

    (user_interest_sy, fee_sy)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixed_point::FP_ONE;

    #[test]
    fn test_calc_yt_interest_spec_example() {
        // 130 YT (24 decimals)
        let yt_bal = 130 * 10u128.pow(24);
        let idx_old = (130 * FP_ONE) / 100; // 1.30
        let idx_new = 1_301_600_000_000_000_000u128; // 1.3016
        let (user_sy, fee_sy) = calc_yt_interest(yt_bal, idx_old, idx_new, 300);

        // Expected total = ~0.1229256 * 10^24
        // fee = 3% -> ~0.0036877 * 10^24
        // user = ~0.1192378 * 10^24
        let total = user_sy + fee_sy;
        assert_eq!(total / 10u128.pow(18), 122925);
        assert_eq!(user_sy / 10u128.pow(18), 119237);
    }
}
