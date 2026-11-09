//! Exodus Backend Service
//!
//! Provides keeper automation, event indexing, and REST APIs for Exodus.

mod config;
mod db;
mod indexer;
mod intents;
mod keeper;
mod near_client;
mod routes;

use config::Config;
use db::Database;
use indexer::Indexer;
use intents::IntentsProxy;
use keeper::Keeper;
use near_client::NearRpcClient;
use routes::{create_router, AppState};
use std::time::Instant;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() {
    // 1. Load environment variables from .env
    dotenvy::dotenv().ok();

    // 2. Initialize structured logging
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "backend=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting Exodus Backend Service...");

    let config = Config::from_env();
    info!("Network: {}", config.near_network);
    info!("RPC URL: {}", config.near_rpc_url);
    info!("Monitored markets: {:?}", config.market_contracts);

    // 3. Connect to PostgreSQL (with graceful fallback if DB is offline)
    let db = match Database::connect(&config.database_url).await {
        Ok(database) => {
            info!("Connected to PostgreSQL at {}", config.database_url);
            if let Err(e) = database.run_migrations().await {
                warn!("Database schema initialization warning: {e}");
            }
            Some(database)
        }
        Err(e) => {
            warn!(
                "Could not connect to PostgreSQL ({}): {e}. Running in live RPC & proxy mode.",
                config.database_url
            );
            None
        }
    };

    // 4. Initialize services
    let near_client = NearRpcClient::new(config.near_rpc_url.clone());
    let intents_proxy = IntentsProxy::new(
        config.oneclick_api_url.clone(),
        config.oneclick_api_key.clone(),
    );

    // 5. Spawn background tasks if database is available
    if let Some(database) = db.clone() {
        let indexer = Indexer::new(config.clone(), database, near_client.clone());
        tokio::spawn(async move {
            indexer.start().await;
        });

        let keeper = Keeper::new(config.clone(), near_client.clone());
        tokio::spawn(async move {
            keeper.start().await;
        });
    }

    // 6. Build Axum application router
    let state = AppState {
        config: config.clone(),
        db,
        near_client,
        intents_proxy,
        start_time: Instant::now(),
    };

    let app = create_router(state);

    // 7. Start HTTP server
    let bind_addr = format!("0.0.0.0:{}", config.port);
    info!("Exodus Backend listening on http://{bind_addr}");

    let listener = match tokio::net::TcpListener::bind(&bind_addr).await {
        Ok(l) => l,
        Err(e) => {
            error!("Failed to bind to {bind_addr}: {e}");
            return;
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        error!("Server encountered an error: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{to_bytes, Body};
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_health_endpoint() {
        let config = Config {
            port: 3001,
            database_url: "postgres://localhost/test".to_string(),
            near_network: "testnet".to_string(),
            near_rpc_url: "https://test.rpc.fastnear.com".to_string(),
            market_contracts: vec!["market.testnet".to_string()],
            keeper_account_id: None,
            keeper_private_key: None,
            oneclick_api_url: "https://1click.chaindefuser.com/v0".to_string(),
            oneclick_api_key: None,
            poll_interval_secs: 60,
        };

        let state = AppState {
            near_client: NearRpcClient::new(config.near_rpc_url.clone()),
            intents_proxy: IntentsProxy::new(config.oneclick_api_url.clone(), None),
            config,
            db: None,
            start_time: Instant::now(),
        };

        let app = create_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body_json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();

        assert_eq!(body_json["status"], "ok");
        assert_eq!(body_json["network"], "testnet");
    }

    #[tokio::test]
    async fn test_markets_endpoint_empty_db() {
        let config = Config {
            port: 3001,
            database_url: "postgres://localhost/test".to_string(),
            near_network: "testnet".to_string(),
            near_rpc_url: "https://test.rpc.fastnear.com".to_string(),
            market_contracts: vec!["market.testnet".to_string()],
            keeper_account_id: None,
            keeper_private_key: None,
            oneclick_api_url: "https://1click.chaindefuser.com/v0".to_string(),
            oneclick_api_key: None,
            poll_interval_secs: 60,
        };

        let state = AppState {
            near_client: NearRpcClient::new(config.near_rpc_url.clone()),
            intents_proxy: IntentsProxy::new(config.oneclick_api_url.clone(), None),
            config,
            db: None,
            start_time: Instant::now(),
        };

        let app = create_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/markets")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body_json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert!(body_json.as_array().unwrap().is_empty());
    }

    #[test]
    fn test_implied_rate_calculation() {
        // Test that 18-dec fixed point log implied rate matches expected APY range
        let ln_rate: i128 = 76_961_041_136_111_513; // ln(1 + 0.08) in 18 dec
        let apy_f64 = (ln_rate as f64) / 1e18;
        assert!((apy_f64 - 0.0769).abs() < 0.001);
    }
}
