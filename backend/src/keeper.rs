//! Keeper service: monitors market index freshness and automatically
//! triggers `refresh_index` when epoch height advances or near maturity.

use crate::{
    config::Config,
    near_client::NearRpcClient,
};
use std::time::Duration;
use tokio::time::sleep;
use tracing::{info, warn};

pub struct Keeper {
    config: Config,
    near_client: NearRpcClient,
}

impl Keeper {
    pub fn new(config: Config, near_client: NearRpcClient) -> Self {
        Self {
            config,
            near_client,
        }
    }

    /// Starts the keeper background loop.
    pub async fn start(self) {
        info!("Starting Keeper service...");

        loop {
            if let Err(e) = self.check_all_markets().await {
                warn!("Keeper check cycle encountered an issue: {e}");
            }

            // Runs keeper checks every 5 minutes
            sleep(Duration::from_secs(300)).await;
        }
    }

    /// Inspects all markets for epoch freshness.
    pub async fn check_all_markets(&self) -> Result<(), String> {
        let current_epoch = match self.near_client.get_current_epoch_height().await {
            Ok(epoch) => epoch,
            Err(e) => {
                warn!("Keeper could not fetch current epoch from RPC: {e}");
                return Ok(());
            }
        };

        for contract_id in &self.config.market_contracts {
            match self.near_client.get_market(contract_id).await {
                Ok(market) => {
                    let is_stale = market.index_epoch < current_epoch;
                    if is_stale {
                        info!(
                            "Market {contract_id} index is stale (market epoch {}, current epoch {}). Triggering refresh...",
                            market.index_epoch, current_epoch
                        );

                        let res = self
                            .near_client
                            .call_refresh_index(
                                contract_id,
                                self.config.keeper_account_id.as_deref(),
                                self.config.keeper_private_key.as_deref(),
                            )
                            .await;

                        match res {
                            Ok(status) => info!("Keeper refresh status for {contract_id}: {status}"),
                            Err(e) => warn!("Keeper failed to refresh index for {contract_id}: {e}"),
                        }
                    } else {
                        info!("Market {contract_id} index is fresh (epoch {current_epoch})");
                    }
                }
                Err(e) => {
                    warn!("Keeper could not fetch market state for {contract_id}: {e}");
                }
            }
        }

        Ok(())
    }
}
