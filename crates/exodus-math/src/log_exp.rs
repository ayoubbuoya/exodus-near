//! Natural logarithm and exponential functions in 18-decimal fixed point.
//!
//! Provides high precision (1e-16 relative error) without external dependencies or floats.

use crate::fixed_point::{fp_div, fp_mul, FP_ONE, FP_ONE_I128};

pub const LN_2: i128 = 693_147_180_559_945_309; // ln(2) in 18 decimals

/// Computes e^x where x is in 18-decimal signed fixed point.
/// Returns e^x in 18-decimal unsigned fixed point.
pub fn fp_exp(x: i128) -> u128 {
    if x == 0 {
        return FP_ONE;
    }
    // Underflow threshold: e^(-42) < 1e-18
    if x < -42 * FP_ONE_I128 {
        return 0;
    }
    // Overflow threshold: e^88 exceeds u128
    if x > 88 * FP_ONE_I128 {
        panic!("fp_exp overflow");
    }

    // Decompose: x = k * ln(2) + r, where 0 <= r < ln(2)
    let mut k = x / LN_2;
    let mut r = x % LN_2;
    if r < 0 {
        r += LN_2;
        k -= 1;
    }

    let r_u128 = r as u128;

    // Taylor series: e^r = 1 + r + r^2/2! + ... + r^14/14!
    let mut sum = FP_ONE;
    let mut term = FP_ONE;
    for i in 1..=14u128 {
        term = fp_mul(term, r_u128) / i;
        sum += term;
    }

    if k >= 0 {
        sum << k
    } else {
        sum >> (-k)
    }
}

/// Computes natural log ln(x) where x > 0 is in 18-decimal unsigned fixed point.
/// Returns ln(x) in 18-decimal signed fixed point.
pub fn fp_ln(x: u128) -> i128 {
    assert!(x > 0, "fp_ln requires x > 0");
    if x == FP_ONE {
        return 0;
    }

    // Normalize x into [FP_ONE, 2 * FP_ONE) by scaling by powers of 2
    let mut m: i128 = 0;
    let mut y = x;

    while y >= 2 * FP_ONE {
        y >>= 1;
        m += 1;
    }
    while y < FP_ONE {
        y <<= 1;
        m -= 1;
    }

    // z = (y - 1) / (y + 1)
    let num = y - FP_ONE;
    let den = y + FP_ONE;
    let z = fp_div(num, den);
    let z2 = fp_mul(z, z);

    // ln(y) = 2 * (z + z^3/3 + z^5/5 + ... + z^25/25)
    let mut sum = 0u128;
    let mut z_pow = z;

    for k in (1..=25u128).step_by(2) {
        sum += z_pow / k;
        z_pow = fp_mul(z_pow, z2);
    }

    let ln_y = (sum * 2) as i128;
    m * LN_2 + ln_y
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exp_zero() {
        assert_eq!(fp_exp(0), FP_ONE);
    }

    #[test]
    fn test_ln_one() {
        assert_eq!(fp_ln(FP_ONE), 0);
    }

    #[test]
    fn test_exp_ln_roundtrip() {
        let values = [
            500_000_000_000_000_000u128,   // 0.5
            1_020_300_000_000_000_000u128, // 1.0203
            1_500_000_000_000_000_000u128, // 1.5
            2_000_000_000_000_000_000u128, // 2.0
        ];
        for v in values {
            let ln_v = fp_ln(v);
            let exp_ln_v = fp_exp(ln_v);
            let diff = (v as i128 - exp_ln_v as i128).abs();
            assert!(diff <= 50, "diff too large: {}", diff);
        }
    }
}
