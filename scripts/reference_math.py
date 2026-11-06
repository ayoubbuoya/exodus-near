#!/usr/bin/env python3
"""
scripts/reference_math.py

Python reference implementation of the Exodus fixed-point math engine,
Pendle V2 logit curve AMM, and YT interest accruals.

Generates test vectors for `crates/exodus-math`.
"""

import json
import math
from decimal import Decimal, getcontext

# Set high decimal precision for golden reference calculations
getcontext().prec = 60

FP_DECIMALS = 18
FP_ONE = 10**18
YEAR = 31536000  # 365 * 86400 seconds


def fp_to_dec(val_int: int) -> Decimal:
    return Decimal(val_int) / Decimal(FP_ONE)


def dec_to_fp(val_dec: Decimal) -> int:
    return int(val_dec * Decimal(FP_ONE))


def mint_py(sy_in: int, py_index: int) -> tuple[int, int]:
    """
    pt_out = yt_out = sy_in * I / 1e18
    """
    pt_out = (sy_in * py_index) // FP_ONE
    yt_out = pt_out
    return pt_out, yt_out


def redeem_py(pt_amount: int, py_index: int) -> int:
    """
    sy_out = pt_amount * 1e18 / I
    """
    return (pt_amount * FP_ONE) // py_index


def calc_yt_interest(yt_balance: int, user_index: int, new_index: int, fee_bps: int = 300) -> tuple[int, int]:
    """
    interest_sy = yt_balance * (new_index - user_index) / (user_index * new_index) * 1e18
    fee_sy      = interest_sy * fee_bps / 10000
    user_sy     = interest_sy - fee_sy
    """
    if new_index <= user_index:
        return 0, 0
    delta_i = new_index - user_index
    num = yt_balance * delta_i * FP_ONE
    den = user_index * new_index
    interest_sy = num // den
    fee_sy = (interest_sy * fee_bps) // 10000
    user_sy = interest_sy - fee_sy
    return user_sy, fee_sy


def ref_fp_ln(x_fp: int) -> int:
    """Natural log in 18-decimal fixed point."""
    dec_val = fp_to_dec(x_fp)
    if dec_val <= 0:
        raise ValueError("ln of non-positive number")
    ln_dec = Decimal(math.log(float(dec_val)))
    return dec_to_fp(ln_dec)


def ref_fp_exp(x_fp: int) -> int:
    """Exponential in 18-decimal fixed point."""
    dec_val = fp_to_dec(x_fp)
    exp_dec = Decimal(math.exp(float(dec_val)))
    return dec_to_fp(exp_dec)


def calc_rate_scalar(scalar_root: int, tau: int) -> int:
    """rate_scalar = scalar_root * YEAR / tau"""
    return (scalar_root * YEAR) // tau


def calc_logit_p(total_pt: int, total_asset: int) -> int:
    """p = total_pt / (total_pt + total_asset) in 18-decimal fixed point"""
    denom = total_pt + total_asset
    return (total_pt * FP_ONE) // denom


def calc_er_from_p(p_fp: int, rate_scalar: int, rate_anchor: int) -> int:
    """
    ER(p) = ln(p / (1 - p)) / rate_scalar + rate_anchor
    """
    p_dec = fp_to_dec(p_fp)
    if p_dec <= 0 or p_dec >= 1:
        raise ValueError("p out of bounds")
    logit = Decimal(math.log(float(p_dec / (1 - p_dec))))
    logit_fp = dec_to_fp(logit)
    term = (logit_fp * FP_ONE) // rate_scalar
    return rate_anchor + term


def generate_test_vectors() -> dict:
    vectors = {
        "constants": {
            "FP_DECIMALS": FP_DECIMALS,
            "FP_ONE": str(FP_ONE),
            "YEAR": YEAR,
        },
        "tokenization": [],
        "interest": [],
        "log_exp": [],
        "amm_checks": [],
    }

    # 1. Tokenization test cases
    # Example from SPEC: 100 LST (24 dec) at index 1.30 (18 dec) -> 130 PT (24 dec)
    # Note: 100 LST with 24 dec = 100 * 10^24
    test_cases_token = [
        {"sy_in": 100 * 10**24, "py_index": int(1.30 * 10**18)},
        {"sy_in": 10 * 10**24, "py_index": int(1.513909620908069045 * 10**18)},
        {"sy_in": 50 * 10**24, "py_index": int(2.284175768908950653 * 10**18)},
    ]
    for tc in test_cases_token:
        pt_out, yt_out = mint_py(tc["sy_in"], tc["py_index"])
        sy_redeemed = redeem_py(pt_out, tc["py_index"])
        vectors["tokenization"].append({
            "sy_in": str(tc["sy_in"]),
            "py_index": str(tc["py_index"]),
            "expected_pt_out": str(pt_out),
            "expected_yt_out": str(yt_out),
            "expected_redeem_sy": str(sy_redeemed),
        })

    # 2. Interest test cases
    # Example from SPEC: 130 YT (24 dec), index 1.30 -> 1.3016 (fee 300 bps = 3%)
    # Expected: 0.1229256... stNEAR total, fee 3%, user gets 0.1192378... stNEAR
    yt_bal = 130 * 10**24
    idx_old = int(1.3000 * 10**18)
    idx_new = int(1.3016 * 10**18)
    user_sy, fee_sy = calc_yt_interest(yt_bal, idx_old, idx_new, fee_bps=300)
    vectors["interest"].append({
        "yt_balance": str(yt_bal),
        "user_index": str(idx_old),
        "new_index": str(idx_new),
        "fee_bps": 300,
        "expected_user_sy": str(user_sy),
        "expected_fee_sy": str(fee_sy),
    })

    # 3. Log / Exp test cases
    log_inputs = [0.01, 0.05, 0.1, 0.5, 0.8, 0.96, 1.0, 1.0203, 1.3, 1.5, 2.0, 5.0, 10.0]
    for val in log_inputs:
        x_fp = int(val * 10**18)
        ln_val = Decimal(math.log(val))
        vectors["log_exp"].append({
            "type": "ln",
            "input": str(x_fp),
            "expected": str(dec_to_fp(ln_val)),
        })

    exp_inputs = [-2.0, -1.0, -0.5, -0.1, -0.01, 0.0, 0.01, 0.05, 0.1, 0.5, 1.0, 1.5, 2.0]
    for val in exp_inputs:
        x_fp = int(val * 10**18)
        exp_val = Decimal(math.exp(val))
        vectors["log_exp"].append({
            "type": "exp",
            "input": str(x_fp),
            "expected": str(dec_to_fp(exp_val)),
        })

    # 4. AMM Check from SPEC section 4.3:
    # scalar_root = 10 * 1e18, 90 days left, implied APY 8.5%
    tau = 90 * 86400
    scalar_root = 10 * FP_ONE
    rate_scalar = calc_rate_scalar(scalar_root, tau)
    implied_apy_dec = Decimal("0.085")
    last_ln_implied_rate = dec_to_fp(Decimal(math.log(float(1 + implied_apy_dec))))
    er_last = dec_to_fp(Decimal(math.exp(float(Decimal(last_ln_implied_rate) / Decimal(FP_ONE) * Decimal(tau) / Decimal(YEAR)))))
    
    vectors["amm_checks"].append({
        "tau": tau,
        "scalar_root": str(scalar_root),
        "expected_rate_scalar": str(rate_scalar),
        "last_ln_implied_rate": str(last_ln_implied_rate),
        "expected_er_last": str(er_last),
    })

    return vectors


if __name__ == "__main__":
    test_vectors = generate_test_vectors()
    with open("scripts/test_vectors.json", "w") as f:
        json.dump(test_vectors, f, indent=2)
    print("Generated scripts/test_vectors.json successfully.")
