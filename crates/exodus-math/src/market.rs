//! Pendle V2 Logit AMM curve implementation.
//!
//! Handles logit curve pricing, dynamic anchor adjustment, and PT/SY swaps.

use crate::fixed_point::{fp_div, fp_mul, FP_ONE, FP_ONE_I128, YEAR_SECONDS};
use crate::log_exp::{fp_exp, fp_ln};

pub const MAX_P_RATIO: u128 = 960_000_000_000_000_000; // 0.96 * 1e18

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MathError {
    MarketExpired,
    InvalidReserves,
    ProportionOutOfBounds,
    ExchangeRateTooLow,
    InsufficientLiquidity,
    BinarySearchFailed,
}

#[derive(Debug, Clone, Copy)]
pub struct MarketAmmConfig {
    pub scalar_root: u128,
    pub initial_anchor: u128,
    pub ln_fee_rate_root: i128,
    pub reserve_fee_bps: u32,
    pub expiry: u64,
}

#[derive(Debug, Clone, Copy)]
pub struct MarketReserves {
    pub total_pt: u128,
    pub total_sy: u128,
    pub last_ln_implied_rate: i128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SwapResult {
    pub net_pt_to_user: i128,
    pub net_sy_to_user: i128,
    pub fee_sy_to_reserve: u128,
    pub new_last_ln_implied_rate: i128,
    pub new_total_pt: u128,
    pub new_total_sy: u128,
}

/// Computes rate scalar: scalar_root * YEAR / tau.
pub fn calc_rate_scalar(scalar_root: u128, tau: u64) -> Result<u128, MathError> {
    if tau == 0 {
        return Err(MathError::MarketExpired);
    }
    let num = scalar_root.checked_mul(YEAR_SECONDS as u128).ok_or(MathError::InvalidReserves)?;
    Ok(num / tau as u128)
}

/// Computes the proportion p = total_pt / (total_pt + total_asset) in 18-decimal fixed point.
pub fn calc_p(total_pt: u128, total_asset: u128) -> Result<u128, MathError> {
    let denom = total_pt.checked_add(total_asset).ok_or(MathError::InvalidReserves)?;
    if denom == 0 {
        return Err(MathError::InsufficientLiquidity);
    }
    let p = fp_div(total_pt, denom);
    if p > MAX_P_RATIO || p == 0 {
        return Err(MathError::ProportionOutOfBounds);
    }
    Ok(p)
}

/// Computes the exchange rate ER(p) = ln(p / (1 - p)) / rate_scalar + rate_anchor.
pub fn calc_er(p: u128, rate_scalar: u128, rate_anchor: u128) -> Result<u128, MathError> {
    if p == 0 || p >= FP_ONE {
        return Err(MathError::ProportionOutOfBounds);
    }
    let p_ratio = fp_div(p, FP_ONE - p);
    let logit = fp_ln(p_ratio);

    // term = (logit * 1e18) / rate_scalar
    let term = (logit * FP_ONE_I128) / (rate_scalar as i128);
    let er_i128 = (rate_anchor as i128) + term;

    if er_i128 < FP_ONE_I128 {
        return Err(MathError::ExchangeRateTooLow);
    }
    Ok(er_i128 as u128)
}

/// Computes the rate anchor before a trade:
/// ER_last = exp(last_ln_implied_rate * tau / YEAR)
/// rate_anchor = ER_last - ln(p0 / (1 - p0)) / rate_scalar
pub fn calc_rate_anchor(
    last_ln_implied_rate: i128,
    tau: u64,
    p0: u128,
    rate_scalar: u128,
) -> Result<u128, MathError> {
    let exponent = (last_ln_implied_rate * (tau as i128)) / (YEAR_SECONDS as i128);
    let er_last = fp_exp(exponent);

    let p0_ratio = fp_div(p0, FP_ONE - p0);
    let p0_logit = fp_ln(p0_ratio);
    let term = (p0_logit * FP_ONE_I128) / (rate_scalar as i128);

    let anchor = (er_last as i128) - term;
    if anchor < 0 {
        return Err(MathError::ExchangeRateTooLow);
    }
    Ok(anchor as u128)
}

/// Executes a trade with exact PT delta:
/// d_pt > 0: user buys PT (pays SY, gets PT).
/// d_pt < 0: user sells PT (pays PT, gets SY).
pub fn calc_swap_pt(
    config: &MarketAmmConfig,
    reserves: &MarketReserves,
    d_pt: i128,
    py_index: u128,
    now: u64,
) -> Result<SwapResult, MathError> {
    if now >= config.expiry {
        return Err(MathError::MarketExpired);
    }
    let tau = config.expiry - now;
    let rate_scalar = calc_rate_scalar(config.scalar_root, tau)?;

    let total_asset = fp_mul(reserves.total_sy, py_index);
    let p0 = calc_p(reserves.total_pt, total_asset)?;
    let rate_anchor = calc_rate_anchor(reserves.last_ln_implied_rate, tau, p0, rate_scalar)?;

    // New reserves after trade
    let new_total_pt = if d_pt > 0 {
        reserves.total_pt.checked_sub(d_pt as u128).ok_or(MathError::InsufficientLiquidity)?
    } else {
        reserves.total_pt.checked_add((-d_pt) as u128).ok_or(MathError::InvalidReserves)?
    };

    let p_new = calc_p(new_total_pt, total_asset)?;
    let pre_fee_er = calc_er(p_new, rate_scalar, rate_anchor)?;

    // pre_fee_asset_to_user = -d_pt / pre_fee_er
    let pre_fee_asset_to_user = if d_pt > 0 {
        -((fp_div(d_pt as u128, pre_fee_er)) as i128)
    } else {
        (fp_div((-d_pt) as u128, pre_fee_er)) as i128
    };

    let fee_exp = (config.ln_fee_rate_root * (tau as i128)) / (YEAR_SECONDS as i128);
    let fee_rate = fp_exp(fee_exp); // 18-decimal fraction <= 1.0

    let fee_asset = if d_pt > 0 {
        // pre_fee_ER / fee_rate >= 1
        let er_after_fee = fp_div(pre_fee_er, fee_rate);
        if er_after_fee < FP_ONE {
            return Err(MathError::ExchangeRateTooLow);
        }
        let fee_fraction = FP_ONE.saturating_sub(fee_rate);
        let abs_asset = (-pre_fee_asset_to_user) as u128;
        fp_mul(abs_asset, fee_fraction)
    } else {
        let fee_fraction = FP_ONE.saturating_sub(fee_rate);
        let abs_asset = pre_fee_asset_to_user as u128;
        let num = fp_mul(abs_asset, fee_fraction);
        fp_div(num, fee_rate)
    };

    let asset_to_user = if d_pt > 0 {
        // user pays more asset: asset_to_user is negative
        pre_fee_asset_to_user - (fee_asset as i128)
    } else {
        // user receives less asset
        pre_fee_asset_to_user - (fee_asset as i128)
    };

    let asset_to_reserve = (fee_asset * (config.reserve_fee_bps as u128)) / 10_000;

    let net_sy_to_user = if asset_to_user >= 0 {
        (fp_div(asset_to_user as u128, py_index)) as i128
    } else {
        -((fp_div((-asset_to_user) as u128, py_index)) as i128)
    };

    let fee_sy_to_reserve = fp_div(asset_to_reserve, py_index);

    // Update SY reserves: total_sy -= (asset_to_user + asset_to_reserve) / I
    let sy_delta = if asset_to_user >= 0 {
        (net_sy_to_user as u128) + fee_sy_to_reserve
    } else {
        fee_sy_to_reserve.saturating_sub((-net_sy_to_user) as u128)
    };

    let new_total_sy = if asset_to_user >= 0 {
        reserves.total_sy.checked_sub(sy_delta).ok_or(MathError::InsufficientLiquidity)?
    } else {
        reserves.total_sy.checked_add((-net_sy_to_user) as u128 - fee_sy_to_reserve).ok_or(MathError::InvalidReserves)?
    };

    // new last_ln_implied_rate = ln(ER(new_p, same_anchor)) * YEAR / tau
    let er_new = calc_er(p_new, rate_scalar, rate_anchor)?;
    let ln_er_new = fp_ln(er_new);
    let new_last_ln_implied_rate = (ln_er_new * (YEAR_SECONDS as i128)) / (tau as i128);

    Ok(SwapResult {
        net_pt_to_user: d_pt,
        net_sy_to_user,
        fee_sy_to_reserve,
        new_last_ln_implied_rate,
        new_total_pt,
        new_total_sy,
    })
}

/// Solves for maximum PT received when spending exact `sy_in` using bounded binary search (64 iterations).
pub fn binary_search_sy_for_pt(
    config: &MarketAmmConfig,
    reserves: &MarketReserves,
    sy_in: u128,
    py_index: u128,
    now: u64,
    _hint_pt: Option<u128>,
) -> Result<u128, MathError> {
    if sy_in == 0 {
        return Ok(0);
    }
    // High bound: cannot buy more than available PT in pool (and max p constraint)
    let max_pt_out = (reserves.total_pt * 95) / 100;
    let mut low = 0u128;
    let mut high = max_pt_out;
    let mut best_pt = 0u128;

    for _ in 0..64 {
        if low > high {
            break;
        }
        let mid = (low + high) / 2;
        if mid == 0 {
            low = 1;
            continue;
        }

        match calc_swap_pt(config, reserves, mid as i128, py_index, now) {
            Ok(res) => {
                let required_sy_in = (-res.net_sy_to_user) as u128;
                if required_sy_in <= sy_in {
                    best_pt = mid;
                    low = mid + 1; // Try to get more PT
                } else {
                    high = mid - 1; // Over budget, reduce PT
                }
            }
            Err(_) => {
                high = mid - 1;
            }
        }
    }

    if best_pt == 0 {
        Err(MathError::BinarySearchFailed)
    } else {
        Ok(best_pt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calc_rate_scalar_spec_example() {
        // scalar_root = 10, 90 days left
        // rate_scalar = 10 * 365 / 90 = 40.5555...
        let scalar_root = 10 * FP_ONE;
        let tau = 90 * 86400;
        let scalar = calc_rate_scalar(scalar_root, tau).unwrap();
        assert_eq!(scalar / FP_ONE, 40);
    }
}
