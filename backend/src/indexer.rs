//! Indexer service: periodically polls market state from NEAR RPC,
//! calculates implied and underlying APYs, and stores time-series snapshots.

use crate::{
    config::Config,
    db::Database,
    near_client::NearRpcClient,
};
use std::time::Duration;
use tokio::time::sleep;
use tracing::{info, warn};

pub struct Indexer {
    config: Config,
    db: Database,
    near_client: NearRpcClient,
}

impl Indexer {
    pub fn new(config: Config, db: Database, near_client: NearRpcClient) -> Self {
        Self {
            config,
            db,
            near_client,
        }
    }

    /// Runs the indexer background task in an infinite loop.
    pub async fn start(self) {
        info!(
            "Starting Indexer service with interval of {}s...",
            self.config.poll_interval_secs
        );

        loop {
            for contract_id in &self.config.market_contracts {
                if let Err(e) = self.index_market(contract_id).await {
                    warn!("Failed to index market {contract_id}: {e}");
                }
            }

            sleep(Duration::from_secs(self.config.poll_interval_secs)).await;
        }
    }

    /// Indexes a single market: fetches view, calculates APYs, and saves snapshot.
    pub async fn index_market(&self, contract_id: &str) -> Result<(), String> {
        let market_view = self.near_client.get_market(contract_id).await?;

        // 1. Ensure market is registered in the database
        let is_demo = contract_id.contains("demo")
            || contract_id.contains("mock")
            || market_view.lst_id.contains("mock");

        self.db
            .upsert_market(
                contract_id,
                contract_id,
                &market_view.lst_id,
                &self.config.near_network,
                market_view.expiry_ns as i64,
                is_demo,
            )
            .await
            .map_err(|e| format!("DB upsert_market error: {e}"))?;

        // 2. Compute implied APY from last_ln_implied_rate (18 decimals fixed point)
        let ln_rate: i128 = market_view
            .last_ln_implied_rate
            .parse()
            .unwrap_or(0);

        let implied_apy_f64 = (ln_rate as f64) / 1e18;
        let implied_apy_str = format!("{:.4}", implied_apy_f64);

        // 3. Compute underlying APY by comparing with historical snapshot
        let prev_snapshot = self
            .db
            .get_latest_snapshot(contract_id)
            .await
            .unwrap_or(None);

        let underlying_apy_str = if let Some(prev) = prev_snapshot {
            let cur_idx: f64 = market_view.py_index.parse().unwrap_or(1e18);
            let prev_idx: f64 = prev.py_index.parse().unwrap_or(1e18);
            if cur_idx > prev_idx && prev_idx > 0.0 {
                let ratio = cur_idx / prev_idx;
                // Annualized yield projection
                let annualized = (ratio - 1.0) * (365.0 * 24.0 * 60.0);
                format!("{:.4}", annualized.clamp(0.01, 0.50))
            } else {
                prev.underlying_apy
            }
        } else {
            // Default baseline benchmark: 8.00%
            "0.0800".to_string()
        };

        // 4. Compute TVL in NEAR
        let total_sy_u128: u128 = market_view.total_sy.parse().unwrap_or(0);
        let py_index_u128: u128 = market_view.py_index.parse().unwrap_or(1_000_000_000_000_000_000);
        // sy * py_index / 1e18 gives NEAR backing in yoctoNEAR
        let tvl_yocto = (total_sy_u128 as u128)
            .checked_mul(py_index_u128)
            .map(|prod| prod / 1_000_000_000_000_000_000)
            .unwrap_or(total_sy_u128);

        let tvl_near_f64 = (tvl_yocto as f64) / 1e24;
        let tvl_near_str = format!("{:.4}", tvl_near_f64);

        // 5. Insert snapshot
        self.db
            .insert_snapshot(
                contract_id,
                &market_view.py_index,
                &implied_apy_str,
                &underlying_apy_str,
                &market_view.total_pt,
                &market_view.total_sy,
                &market_view.total_lp,
                &tvl_near_str,
            )
            .await
            .map_err(|e| format!("DB insert_snapshot error: {e}"))?;

        info!(
            "Indexed {contract_id}: Implied APY={implied_apy_str}, Underlying APY={underlying_apy_str}, TVL={tvl_near_str} NEAR"
        );

        Ok(())
    }
}
