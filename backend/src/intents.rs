//! Proxy for NEAR Intents (1Click) API.
//! Manages caching of supported tokens and keeps API keys server-side.

use reqwest::Client;
use serde_json::Value;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::RwLock;
use tracing::info;

#[derive(Clone)]
pub struct IntentsProxy {
    client: Client,
    api_url: String,
    api_key: Option<String>,
    cached_tokens: Arc<RwLock<Option<(Value, Instant)>>>,
}

impl IntentsProxy {
    pub fn new(api_url: String, api_key: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_default();

        Self {
            client,
            api_url,
            api_key,
            cached_tokens: Arc::new(RwLock::new(None)),
        }
    }

    /// Fetches supported tokens list, cached in memory for 10 minutes.
    pub async fn get_tokens(&self) -> Result<Value, String> {
        // 1. Check cache
        {
            let cache_read = self.cached_tokens.read().await;
            if let Some((tokens, cached_at)) = &*cache_read {
                if cached_at.elapsed() < Duration::from_secs(600) {
                    return Ok(tokens.clone());
                }
            }
        }

        // 2. Fetch fresh tokens from 1Click API
        let endpoint = format!("{}/tokens", self.api_url);
        info!("Fetching fresh tokens list from 1Click: {endpoint}");

        let mut req = self.client.get(&endpoint);
        if let Some(key) = &self.api_key {
            req = req.header("X-API-Key", key);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("1Click tokens request failed: {e}"))?;

        let tokens_json: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse 1Click tokens JSON: {e}"))?;

        // 3. Update cache
        {
            let mut cache_write = self.cached_tokens.write().await;
            *cache_write = Some((tokens_json.clone(), Instant::now()));
        }

        Ok(tokens_json)
    }

    /// Requests a swap quote (supports dry-run).
    pub async fn get_quote(&self, payload: Value) -> Result<Value, String> {
        let endpoint = format!("{}/quote", self.api_url);

        let mut req = self.client.post(&endpoint).json(&payload);
        if let Some(key) = &self.api_key {
            req = req.header("X-API-Key", key);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("1Click quote request failed: {e}"))?;

        let quote_json: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse 1Click quote JSON: {e}"))?;

        Ok(quote_json)
    }

    /// Checks the status of a cross-chain swap deposit.
    pub async fn get_status(&self, deposit_address: &str) -> Result<Value, String> {
        let endpoint = format!("{}/status/{}", self.api_url, deposit_address);

        let mut req = self.client.get(&endpoint);
        if let Some(key) = &self.api_key {
            req = req.header("X-API-Key", key);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("1Click status request failed: {e}"))?;

        let status_json: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse 1Click status JSON: {e}"))?;

        Ok(status_json)
    }
}
