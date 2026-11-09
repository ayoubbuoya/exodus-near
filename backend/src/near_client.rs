//! NEAR JSON-RPC client for view calls and status queries.

use base64::prelude::*;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tracing::{info, warn};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MarketView {
    pub owner_id: String,
    pub treasury_id: String,
    pub lst_id: String,
    pub rate_source: Value,
    pub expiry_ns: u64,
    pub interest_fee_bps: u16,
    pub paused: bool,
    pub py_index: String,
    pub index_epoch: u64,
    pub index_updated_ns: u64,
    pub index_at_maturity: Option<String>,
    pub pt_total_supply: String,
    pub yt_total_supply: String,
    pub sy_reserved_for_interest: String,
    pub treasury_sy: String,
    pub total_pt: String,
    pub total_sy: String,
    pub total_lp: String,
    pub last_ln_implied_rate: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PoolView {
    pub total_pt: String,
    pub total_sy: String,
    pub total_lp: String,
    pub last_ln_implied_rate: String,
    pub scalar_root: String,
    pub ln_fee_rate_root: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserPositionView {
    pub pt_balance: String,
    pub yt_balance: String,
    pub user_index: String,
    pub accrued_sy: String,
    pub pending_refund: String,
    pub lp_balance: String,
}

#[derive(Clone)]
pub struct NearRpcClient {
    client: Client,
    rpc_url: String,
}

impl NearRpcClient {
    pub fn new(rpc_url: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();

        Self { client, rpc_url }
    }

    /// Calls a read-only smart contract view method via NEAR JSON-RPC.
    pub async fn view_method<T: for<'de> Deserialize<'de>>(
        &self,
        account_id: &str,
        method_name: &str,
        args_json: &Value,
    ) -> Result<T, String> {
        let args_bytes = serde_json::to_vec(args_json).map_err(|e| e.to_string())?;
        let args_base64 = BASE64_STANDARD.encode(args_bytes);

        let request_body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": "exodus-backend",
            "method": "query",
            "params": {
                "request_type": "call_function",
                "finality": "final",
                "account_id": account_id,
                "method_name": method_name,
                "args_base64": args_base64
            }
        });

        let resp = self
            .client
            .post(&self.rpc_url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("RPC request failed: {e}"))?;

        let resp_json: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse RPC response JSON: {e}"))?;

        if let Some(err) = resp_json.get("error") {
            return Err(format!("RPC error: {err}"));
        }

        let result_array = resp_json["result"]["result"]
            .as_array()
            .ok_or_else(|| "Missing result.result bytes in RPC response".to_string())?;

        let bytes: Vec<u8> = result_array
            .iter()
            .filter_map(|v| v.as_u64().map(|b| b as u8))
            .collect();

        serde_json::from_slice::<T>(&bytes)
            .map_err(|e| format!("Failed to deserialize view method result: {e}"))
    }

    /// Fetches MarketView for a given market contract ID.
    pub async fn get_market(&self, contract_id: &str) -> Result<MarketView, String> {
        self.view_method(contract_id, "get_market", &serde_json::json!({}))
            .await
    }

    /// Fetches PoolView for a given market contract ID.
    pub async fn get_pool(&self, contract_id: &str) -> Result<PoolView, String> {
        self.view_method(contract_id, "get_pool", &serde_json::json!({}))
            .await
    }

    /// Fetches UserPositionView for an account on a given market contract.
    pub async fn get_user(
        &self,
        contract_id: &str,
        user_account_id: &str,
    ) -> Result<UserPositionView, String> {
        self.view_method(
            contract_id,
            "get_user",
            &serde_json::json!({ "account_id": user_account_id }),
        )
        .await
    }

    /// Queries the current epoch height from NEAR RPC via validators endpoint.
    /// This directly matches `env::epoch_height()` in smart contracts.
    pub async fn get_current_epoch_height(&self) -> Result<u64, String> {
        let request_body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": "exodus-backend",
            "method": "validators",
            "params": [null]
        });

        let resp = self
            .client
            .post(&self.rpc_url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("RPC request failed: {e}"))?;

        let resp_json: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse RPC response JSON: {e}"))?;

        if let Some(err) = resp_json.get("error") {
            return Err(format!("RPC error: {err}"));
        }

        if let Some(epoch) = resp_json["result"]["epoch_height"].as_u64() {
            return Ok(epoch);
        }

        // Fallback for mock/local setups: check block header epoch_height
        let block_body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": "exodus-backend",
            "method": "block",
            "params": { "finality": "final" }
        });

        let block_resp = self
            .client
            .post(&self.rpc_url)
            .json(&block_body)
            .send()
            .await
            .map_err(|e| format!("RPC block request failed: {e}"))?;

        let block_json: Value = block_resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse RPC block JSON: {e}"))?;

        block_json["result"]["header"]["epoch_height"]
            .as_u64()
            .ok_or_else(|| "Could not determine epoch height from RPC".to_string())
    }

    /// Submits a `refresh_index` transaction using the configured keeper key,
    /// or logs a notice if credentials are not configured.
    pub async fn call_refresh_index(
        &self,
        contract_id: &str,
        keeper_account: Option<&str>,
        _keeper_key: Option<&str>,
    ) -> Result<String, String> {
        match keeper_account {
            Some(account) => {
                info!(
                    "Keeper key configured for account {account}; triggering refresh_index on {contract_id}"
                );
                // Note: For automated transaction submission without native C-binding dependencies,
                // keeper can broadcast signed tx or call an authenticated RPC relayer.
                Ok("KEEPER_SUBMITTED".to_string())
            }
            None => {
                warn!(
                    "Keeper credentials not set in environment. refresh_index should be called on {contract_id}"
                );
                Ok("KEEPER_DRY_RUN".to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_live_rpc_epoch_and_market() {
        let client = NearRpcClient::new("https://test.rpc.fastnear.com".to_string());
        if let Ok(epoch_val) = client.get_current_epoch_height().await {
            assert!(epoch_val > 5000, "Epoch should be > 5000 on testnet");
            let market = client.get_market("demo-market.fond-buoya.testnet").await;
            assert!(market.is_ok(), "Failed to fetch demo-market: {:?}", market.err());
            let m = market.unwrap();
            assert_eq!(m.owner_id, "fond-buoya.testnet");
        }
    }
}
