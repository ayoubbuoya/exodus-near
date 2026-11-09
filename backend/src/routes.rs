//! Axum HTTP routes and request handlers for the Exodus REST API.

use crate::{
    config::Config,
    db::Database,
    intents::IntentsProxy,
    near_client::NearRpcClient,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{sync::Arc, time::Instant};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: Option<Database>,
    pub near_client: NearRpcClient,
    pub intents_proxy: IntentsProxy,
    pub start_time: Instant,
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct TradesQuery {
    pub limit: Option<i64>,
}

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health_handler))
        .route("/markets", get(markets_handler))
        .route("/markets/{id}", get(market_detail_handler))
        .route("/markets/{id}/history", get(market_history_handler))
        .route("/markets/{id}/trades", get(market_trades_handler))
        .route("/users/{account}/positions", get(user_positions_handler))
        .route("/intents/tokens", get(intents_tokens_handler))
        .route("/intents/quote", post(intents_quote_handler))
        .route("/intents/status/{address}", get(intents_status_handler))
        .layer(cors)
        .with_state(Arc::new(state))
}

// -----------------------------------------------------------------------------
// Route Handlers
// -----------------------------------------------------------------------------

async fn health_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let db_status = match &state.db {
        Some(_) => "connected",
        None => "disabled/unavailable",
    };

    Json(json!({
        "status": "ok",
        "service": "exodus-backend",
        "network": state.config.near_network,
        "database": db_status,
        "uptime_secs": state.start_time.elapsed().as_secs(),
        "timestamp": Utc::now(),
    }))
}

async fn markets_handler(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let db = match &state.db {
        Some(db) => db,
        None => return Ok(Json(json!([]))),
    };

    let markets = db
        .get_markets()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut enriched = Vec::new();
    for m in markets {
        let latest = db.get_latest_snapshot(&m.id).await.unwrap_or(None);
        enriched.push(json!({
            "market": m,
            "latest_snapshot": latest,
        }));
    }

    Ok(Json(json!(enriched)))
}

async fn market_detail_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let db = match &state.db {
        Some(db) => db,
        None => return Err((StatusCode::NOT_FOUND, "Database not available".to_string())),
    };

    let market = db
        .get_market_by_id(&id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Market {id} not found")))?;

    let latest_snapshot = db.get_latest_snapshot(&id).await.unwrap_or(None);
    let pool_view = state.near_client.get_pool(&market.contract_id).await.ok();

    Ok(Json(json!({
        "market": market,
        "latest_snapshot": latest_snapshot,
        "pool": pool_view,
    })))
}

async fn market_history_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<HistoryQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let db = match &state.db {
        Some(db) => db,
        None => return Ok(Json(json!([]))),
    };

    let limit = query.limit.unwrap_or(100).clamp(1, 1000);
    let history = db
        .get_snapshots_history(&id, limit)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(json!(history)))
}

async fn market_trades_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<TradesQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let db = match &state.db {
        Some(db) => db,
        None => return Ok(Json(json!([]))),
    };

    let limit = query.limit.unwrap_or(50).clamp(1, 500);
    let events = db
        .get_events(&id, limit)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(json!(events)))
}

async fn user_positions_handler(
    State(state): State<Arc<AppState>>,
    Path(account): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut positions = Vec::new();

    for contract_id in &state.config.market_contracts {
        match state.near_client.get_user(contract_id, &account).await {
            Ok(pos) => {
                positions.push(json!({
                    "market_id": contract_id,
                    "position": pos,
                }));
            }
            Err(_) => {
                // User may not be active on this market
            }
        }
    }

    Ok(Json(json!({
        "account_id": account,
        "positions": positions,
    })))
}

async fn intents_tokens_handler(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let tokens = state
        .intents_proxy
        .get_tokens()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    Ok(Json(tokens))
}

async fn intents_quote_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let quote = state
        .intents_proxy
        .get_quote(payload)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    Ok(Json(quote))
}

async fn intents_status_handler(
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let status = state
        .intents_proxy
        .get_status(&address)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    Ok(Json(status))
}
