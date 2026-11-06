//! Mock LST Contract
//!
//! A test NEP-141 token with an admin-increasable exchange rate for sandbox testing and demos.

#![allow(dead_code)]

pub fn mock_lst_name() -> &'static str {
    "Mock Liquid Staking NEAR"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_lst_name() {
        assert_eq!(mock_lst_name(), "Mock Liquid Staking NEAR");
    }
}
