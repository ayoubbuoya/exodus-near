//! NEP-297 Event emission helpers for Exodus Market.

use near_sdk::{env, AccountId};

pub fn emit_mint_py(
    account_id: &AccountId,
    sy_in: u128,
    pt_out: u128,
    yt_out: u128,
    py_index: u128,
) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"exodus\",\"version\":\"1.0.0\",\"event\":\"mint_py\",\"data\":[{{\"account_id\":\"{}\",\"sy_in\":\"{}\",\"pt_out\":\"{}\",\"yt_out\":\"{}\",\"py_index\":\"{}\"}}]}}",
        account_id, sy_in, pt_out, yt_out, py_index
    ));
}

pub fn emit_redeem_py(
    account_id: &AccountId,
    pt_in: u128,
    yt_in: u128,
    sy_out: u128,
    py_index: u128,
) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"exodus\",\"version\":\"1.0.0\",\"event\":\"redeem_py\",\"data\":[{{\"account_id\":\"{}\",\"pt_in\":\"{}\",\"yt_in\":\"{}\",\"sy_out\":\"{}\",\"py_index\":\"{}\"}}]}}",
        account_id, pt_in, yt_in, sy_out, py_index
    ));
}

pub fn emit_redeem_pt(account_id: &AccountId, pt_in: u128, sy_out: u128, py_index: u128) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"exodus\",\"version\":\"1.0.0\",\"event\":\"redeem_pt\",\"data\":[{{\"account_id\":\"{}\",\"pt_in\":\"{}\",\"sy_out\":\"{}\",\"py_index\":\"{}\"}}]}}",
        account_id, pt_in, sy_out, py_index
    ));
}

pub fn emit_claim_interest(
    account_id: &AccountId,
    interest_sy: u128,
    fee_sy: u128,
    py_index: u128,
) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"exodus\",\"version\":\"1.0.0\",\"event\":\"claim_interest\",\"data\":[{{\"account_id\":\"{}\",\"interest_sy\":\"{}\",\"fee_sy\":\"{}\",\"py_index\":\"{}\"}}]}}",
        account_id, interest_sy, fee_sy, py_index
    ));
}

pub fn emit_index_updated(py_index: u128, index_epoch: u64) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"exodus\",\"version\":\"1.0.0\",\"event\":\"index_updated\",\"data\":[{{\"py_index\":\"{}\",\"index_epoch\":{}}}]}}",
        py_index, index_epoch
    ));
}

pub fn emit_market_matured(index_at_maturity: u128, timestamp_ns: u64) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"exodus\",\"version\":\"1.0.0\",\"event\":\"market_matured\",\"data\":[{{\"index_at_maturity\":\"{}\",\"timestamp_ns\":{}}}]}}",
        index_at_maturity, timestamp_ns
    ));
}

pub fn emit_paused(account_id: &AccountId) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"exodus\",\"version\":\"1.0.0\",\"event\":\"paused\",\"data\":[{{\"by\":\"{}\"}}]}}",
        account_id
    ));
}

pub fn emit_unpaused(account_id: &AccountId) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"exodus\",\"version\":\"1.0.0\",\"event\":\"unpaused\",\"data\":[{{\"by\":\"{}\"}}]}}",
        account_id
    ));
}

pub fn emit_swap(
    account_id: &AccountId,
    kind: &str,
    amount_in: u128,
    amount_out: u128,
    fee_sy: u128,
    py_index: u128,
) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"exodus\",\"version\":\"1.0.0\",\"event\":\"swap\",\"data\":[{{\"account_id\":\"{}\",\"kind\":\"{}\",\"amount_in\":\"{}\",\"amount_out\":\"{}\",\"fee_sy\":\"{}\",\"py_index\":\"{}\"}}]}}",
        account_id, kind, amount_in, amount_out, fee_sy, py_index
    ));
}

pub fn emit_add_liquidity(account_id: &AccountId, pt_in: u128, sy_in: u128, lp_out: u128) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"exodus\",\"version\":\"1.0.0\",\"event\":\"add_liquidity\",\"data\":[{{\"account_id\":\"{}\",\"pt_in\":\"{}\",\"sy_in\":\"{}\",\"lp_out\":\"{}\"}}]}}",
        account_id, pt_in, sy_in, lp_out
    ));
}

pub fn emit_remove_liquidity(account_id: &AccountId, lp_in: u128, pt_out: u128, sy_out: u128) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"exodus\",\"version\":\"1.0.0\",\"event\":\"remove_liquidity\",\"data\":[{{\"account_id\":\"{}\",\"lp_in\":\"{}\",\"pt_out\":\"{}\",\"sy_out\":\"{}\"}}]}}",
        account_id, lp_in, pt_out, sy_out
    ));
}
