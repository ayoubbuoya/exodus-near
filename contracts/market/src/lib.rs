//! Exodus Market Contract
//!
//! Manages PT NEP-141 token, internal YT ledger, and AMM swaps.

#![allow(dead_code)]

pub fn market_version() -> &'static str {
    "0.1.0"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_market_version() {
        assert_eq!(market_version(), "0.1.0");
    }
}
