//! exodus-math
//!
//! Pure Rust fixed-point math engine for Exodus on NEAR.
//!
//! Features:
//! - 18-decimal fixed-point arithmetic (`FP_ONE = 1e18`) with 256-bit intermediate safety.
//! - High-precision natural logarithm (`fp_ln`) and exponential (`fp_exp`).
//! - Principal Token (PT) and Yield Token (YT) tokenization math.
//! - YT interest accrual and protocol fee tracking.
//! - Pendle V2 logit AMM curve pricing and bounded binary search swaps.

pub mod fixed_point;
pub mod interest;
pub mod log_exp;
pub mod market;
pub mod tokenization;

pub use fixed_point::*;
pub use interest::*;
pub use log_exp::*;
pub use market::*;
pub use tokenization::*;
