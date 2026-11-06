//! Fixed-point arithmetic with 18 decimal places.
//!
//! Provides overflow-safe 256-bit intermediate multiplication and division for `u128` and `i128`.

pub const FP_DECIMALS: u32 = 18;
pub const FP_ONE: u128 = 1_000_000_000_000_000_000;
pub const FP_ONE_I128: i128 = 1_000_000_000_000_000_000;
pub const YEAR_SECONDS: u64 = 31_536_000; // 365 days in seconds

/// Multiplies two u128 values producing a 256-bit result as (hi, lo).
pub fn mul_u256(a: u128, b: u128) -> (u128, u128) {
    let a_lo = a as u64 as u128;
    let a_hi = a >> 64;
    let b_lo = b as u64 as u128;
    let b_hi = b >> 64;

    let p0 = a_lo * b_lo;
    let p1 = a_lo * b_hi;
    let p2 = a_hi * b_lo;
    let p3 = a_hi * b_hi;

    let mid = p1 + (p0 >> 64);
    let mid_lo = (mid as u64 as u128) + p2;
    let carry = (mid >> 64) + (mid_lo >> 64);

    let res_lo = ((mid_lo as u64 as u128) << 64) | (p0 as u64 as u128);
    let res_hi = p3 + carry;
    (res_hi, res_lo)
}

/// Computes floor(sqrt(a * b)) for two u128 values with exact 256-bit precision.
pub fn sqrt_mul_u128(a: u128, b: u128) -> u128 {
    if a == 0 || b == 0 {
        return 0;
    }
    let (hi, lo) = mul_u256(a, b);

    let lz = if hi == 0 {
        128 + lo.leading_zeros()
    } else {
        hi.leading_zeros()
    };

    let max_bits = (256 - lz + 1) / 2;
    let mut high = if max_bits >= 128 {
        u128::MAX
    } else {
        1u128 << max_bits
    };
    let mut low = 1u128;
    let mut ans = 0u128;

    while low <= high {
        let mid = low + (high - low) / 2;
        let (m_hi, m_lo) = mul_u256(mid, mid);
        if (m_hi, m_lo) <= (hi, lo) {
            ans = mid;
            if mid == u128::MAX {
                break;
            }
            low = mid + 1;
        } else {
            if mid == 0 {
                break;
            }
            high = mid - 1;
        }
    }
    ans
}

/// Computes (a * b) / c with 256-bit intermediate precision, rounding down.
pub fn mul_div_down(a: u128, b: u128, c: u128) -> Option<u128> {
    if c == 0 {
        return None;
    }
    // Decompose a and b into 64-bit limbs
    let a_lo = a as u64 as u128;
    let a_hi = a >> 64;
    let b_lo = b as u64 as u128;
    let b_hi = b >> 64;

    let p0 = a_lo * b_lo;
    let p1 = a_lo * b_hi;
    let p2 = a_hi * b_lo;
    let p3 = a_hi * b_hi;

    let mid = p1 + (p0 >> 64);
    let mid_lo = (mid as u64 as u128) + p2;
    let carry = (mid >> 64) + (mid_lo >> 64);

    let res_lo = ((mid_lo as u64 as u128) << 64) | (p0 as u64 as u128);
    let res_hi = p3 + carry;

    if res_hi == 0 {
        return Some(res_lo / c);
    }

    // Binary long division: 256-bit by 128-bit
    let mut q_hi = 0u128;
    let mut q_lo = 0u128;
    let mut rem_hi = 0u128;
    let mut rem_lo = 0u128;

    for i in (0..256).rev() {
        // Shift remainder left by 1
        rem_hi = (rem_hi << 1) | (rem_lo >> 127);
        rem_lo <<= 1;

        // Bring down bit i from dividend
        let bit = if i >= 128 {
            (res_hi >> (i - 128)) & 1
        } else {
            (res_lo >> i) & 1
        };
        rem_lo |= bit;

        // If rem >= c, subtract and set bit in quotient
        if rem_hi > 0 || rem_lo >= c {
            rem_lo = rem_lo.wrapping_sub(c);
            if rem_hi > 0 && rem_lo > u128::MAX - c {
                rem_hi -= 1;
            }
            if i >= 128 {
                q_hi |= 1 << (i - 128);
            } else {
                q_lo |= 1 << i;
            }
        }
    }

    if q_hi != 0 {
        None // Overflow u128
    } else {
        Some(q_lo)
    }
}

/// Computes (a * b) / c with 256-bit intermediate precision, rounding up.
pub fn mul_div_up(a: u128, b: u128, c: u128) -> Option<u128> {
    let down = mul_div_down(a, b, c)?;
    // Check if remainder is non-zero
    let rem = match mul_rem(a, b, c) {
        Some(r) => r,
        None => 0,
    };
    if rem > 0 {
        down.checked_add(1)
    } else {
        Some(down)
    }
}

fn mul_rem(a: u128, b: u128, c: u128) -> Option<u128> {
    if c == 0 {
        return None;
    }
    // Decompose a and b into 64-bit limbs
    let a_lo = a as u64 as u128;
    let a_hi = a >> 64;
    let b_lo = b as u64 as u128;
    let b_hi = b >> 64;

    let p0 = a_lo * b_lo;
    let p1 = a_lo * b_hi;
    let p2 = a_hi * b_lo;
    let p3 = a_hi * b_hi;

    let mid = p1 + (p0 >> 64);
    let mid_lo = (mid as u64 as u128) + p2;
    let carry = (mid >> 64) + (mid_lo >> 64);

    let res_lo = ((mid_lo as u64 as u128) << 64) | (p0 as u64 as u128);
    let res_hi = p3 + carry;

    let mut rem_hi = 0u128;
    let mut rem_lo = 0u128;

    for i in (0..256).rev() {
        rem_hi = (rem_hi << 1) | (rem_lo >> 127);
        rem_lo <<= 1;

        let bit = if i >= 128 {
            (res_hi >> (i - 128)) & 1
        } else {
            (res_lo >> i) & 1
        };
        rem_lo |= bit;

        if rem_hi > 0 || rem_lo >= c {
            rem_lo = rem_lo.wrapping_sub(c);
            if rem_hi > 0 && rem_lo > u128::MAX - c {
                rem_hi -= 1;
            }
        }
    }
    Some(rem_lo)
}

/// Fixed-point multiplication: (a * b) / 10^18 (rounding down).
#[inline]
pub fn fp_mul(a: u128, b: u128) -> u128 {
    mul_div_down(a, b, FP_ONE).expect("fp_mul overflow")
}

/// Fixed-point multiplication: (a * b) / 10^18 (rounding up).
#[inline]
pub fn fp_mul_up(a: u128, b: u128) -> u128 {
    mul_div_up(a, b, FP_ONE).expect("fp_mul_up overflow")
}

/// Fixed-point division: (a * 10^18) / b (rounding down).
#[inline]
pub fn fp_div(a: u128, b: u128) -> u128 {
    mul_div_down(a, FP_ONE, b).expect("fp_div division by zero or overflow")
}

/// Fixed-point division: (a * 10^18) / b (rounding up).
#[inline]
pub fn fp_div_up(a: u128, b: u128) -> u128 {
    mul_div_up(a, FP_ONE, b).expect("fp_div_up division by zero or overflow")
}

/// Signed fixed-point multiplication for i128.
pub fn fp_mul_i128(a: i128, b: i128) -> i128 {
    let sign = (a < 0) ^ (b < 0);
    let a_abs = a.unsigned_abs();
    let b_abs = b.unsigned_abs();
    let res = fp_mul(a_abs, b_abs) as i128;
    if sign {
        -res
    } else {
        res
    }
}

/// Signed fixed-point division for i128.
pub fn fp_div_i128(a: i128, b: i128) -> i128 {
    let sign = (a < 0) ^ (b < 0);
    let a_abs = a.unsigned_abs();
    let b_abs = b.unsigned_abs();
    let res = fp_div(a_abs, b_abs) as i128;
    if sign {
        -res
    } else {
        res
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mul_div_down_basic() {
        assert_eq!(mul_div_down(10, 20, 5), Some(40));
        assert_eq!(mul_div_down(10, 20, 7), Some(28));
    }

    #[test]
    fn test_mul_div_up_basic() {
        assert_eq!(mul_div_up(10, 20, 5), Some(40));
        assert_eq!(mul_div_up(10, 20, 7), Some(29));
    }

    #[test]
    fn test_fp_mul_div_identity() {
        let x = 12345678901234567890u128;
        assert_eq!(fp_mul(x, FP_ONE), x);
        assert_eq!(fp_div(x, FP_ONE), x);
    }

    #[test]
    fn test_sqrt_mul_u128() {
        assert_eq!(sqrt_mul_u128(0, 100), 0);
        assert_eq!(sqrt_mul_u128(16, 25), 20);
        assert_eq!(sqrt_mul_u128(2, 2), 2);
        assert_eq!(sqrt_mul_u128(2, 3), 2);
        let large = 100_000_000_000_000_000_000_000_000u128; // 100 * 10^24
        assert_eq!(sqrt_mul_u128(large, large), large);
    }
}
