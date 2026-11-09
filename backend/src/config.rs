//! Backend configuration loading from environment variables.

use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub near_network: String,
    pub near_rpc_url: String,
    pub market_contracts: Vec<String>,
    pub keeper_account_id: Option<String>,
    pub keeper_private_key: Option<String>,
    pub oneclick_api_url: String,
    pub oneclick_api_key: Option<String>,
    pub poll_interval_secs: u64,
}

impl Config {
    pub fn from_env() -> Self {
        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3001);

        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/exodus".to_string());

        let near_network = env::var("NEAR_NETWORK")
            .unwrap_or_else(|_| "testnet".to_string());

        let near_rpc_url = env::var("NEAR_RPC_URL")
            .unwrap_or_else(|_| {
                if near_network == "mainnet" {
                    "https://rpc.mainnet.near.org".to_string()
                } else {
                    "https://rpc.testnet.near.org".to_string()
                }
            });

        let market_contracts = env::var("MARKET_CONTRACTS")
            .unwrap_or_else(|_| "market.fond-buoya.testnet".to_string())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let keeper_account_id = env::var("KEEPER_ACCOUNT_ID")
            .ok()
            .filter(|s| !s.trim().is_empty());

        let keeper_private_key = env::var("KEEPER_PRIVATE_KEY")
            .ok()
            .filter(|s| !s.trim().is_empty());

        let oneclick_api_url = env::var("ONECLICK_API_URL")
            .unwrap_or_else(|_| "https://1click.chaindefuser.com/v0".to_string());

        let oneclick_api_key = env::var("ONECLICK_API_KEY")
            .ok()
            .filter(|s| !s.trim().is_empty());

        let poll_interval_secs = env::var("POLL_INTERVAL_SECS")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(60);

        Self {
            port,
            database_url,
            near_network,
            near_rpc_url,
            market_contracts,
            keeper_account_id,
            keeper_private_key,
            oneclick_api_url,
            oneclick_api_key,
            poll_interval_secs,
        }
    }
}
