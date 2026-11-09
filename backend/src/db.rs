//! PostgreSQL database operations using SQLx.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use tracing::info;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MarketRecord {
    pub id: String,
    pub contract_id: String,
    pub lst_id: String,
    pub network: String,
    pub expiry_ns: i64,
    pub is_demo: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SnapshotRecord {
    pub market_id: String,
    pub ts: DateTime<Utc>,
    pub py_index: String,
    pub implied_apy: String,
    pub underlying_apy: String,
    pub total_pt: String,
    pub total_sy: String,
    pub total_lp: String,
    pub tvl_near: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EventRecord {
    pub id: i64,
    pub market_id: String,
    pub receipt_id: Option<String>,
    pub event_type: String,
    pub account_id: String,
    pub data_json: Value,
    pub ts: DateTime<Utc>,
}

#[derive(Clone)]
pub struct Database {
    pub pool: PgPool,
}

impl Database {
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await?;

        Ok(Self { pool })
    }

    pub async fn run_migrations(&self) -> Result<(), sqlx::Error> {
        info!("Running database initialization schema...");
        let migration_sql = include_str!("../migrations/20261109000001_init.sql");
        sqlx::raw_sql(migration_sql).execute(&self.pool).await?;
        info!("Database schema initialized successfully.");
        Ok(())
    }

    pub async fn upsert_market(
        &self,
        id: &str,
        contract_id: &str,
        lst_id: &str,
        network: &str,
        expiry_ns: i64,
        is_demo: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO markets (id, contract_id, lst_id, network, expiry_ns, is_demo)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                contract_id = EXCLUDED.contract_id,
                lst_id = EXCLUDED.lst_id,
                network = EXCLUDED.network,
                expiry_ns = EXCLUDED.expiry_ns,
                is_demo = EXCLUDED.is_demo;
            "#,
        )
        .bind(id)
        .bind(contract_id)
        .bind(lst_id)
        .bind(network)
        .bind(expiry_ns)
        .bind(is_demo)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn insert_snapshot(
        &self,
        market_id: &str,
        py_index: &str,
        implied_apy: &str,
        underlying_apy: &str,
        total_pt: &str,
        total_sy: &str,
        total_lp: &str,
        tvl_near: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO market_snapshots (
                market_id, py_index, implied_apy, underlying_apy,
                total_pt, total_sy, total_lp, tvl_near
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (market_id, ts) DO NOTHING;
            "#,
        )
        .bind(market_id)
        .bind(py_index)
        .bind(implied_apy)
        .bind(underlying_apy)
        .bind(total_pt)
        .bind(total_sy)
        .bind(total_lp)
        .bind(tvl_near)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_markets(&self) -> Result<Vec<MarketRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, contract_id, lst_id, network, expiry_ns, is_demo, created_at
            FROM markets
            ORDER BY created_at ASC;
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let markets = rows
            .into_iter()
            .map(|r| MarketRecord {
                id: r.get("id"),
                contract_id: r.get("contract_id"),
                lst_id: r.get("lst_id"),
                network: r.get("network"),
                expiry_ns: r.get("expiry_ns"),
                is_demo: r.get("is_demo"),
                created_at: r.get("created_at"),
            })
            .collect();

        Ok(markets)
    }

    pub async fn get_market_by_id(&self, id: &str) -> Result<Option<MarketRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, contract_id, lst_id, network, expiry_ns, is_demo, created_at
            FROM markets
            WHERE id = $1;
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| MarketRecord {
            id: r.get("id"),
            contract_id: r.get("contract_id"),
            lst_id: r.get("lst_id"),
            network: r.get("network"),
            expiry_ns: r.get("expiry_ns"),
            is_demo: r.get("is_demo"),
            created_at: r.get("created_at"),
        }))
    }

    pub async fn get_latest_snapshot(
        &self,
        market_id: &str,
    ) -> Result<Option<SnapshotRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT market_id, ts, py_index, implied_apy, underlying_apy,
                   total_pt, total_sy, total_lp, tvl_near
            FROM market_snapshots
            WHERE market_id = $1
            ORDER BY ts DESC
            LIMIT 1;
            "#,
        )
        .bind(market_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| SnapshotRecord {
            market_id: r.get("market_id"),
            ts: r.get("ts"),
            py_index: r.get("py_index"),
            implied_apy: r.get("implied_apy"),
            underlying_apy: r.get("underlying_apy"),
            total_pt: r.get("total_pt"),
            total_sy: r.get("total_sy"),
            total_lp: r.get("total_lp"),
            tvl_near: r.get("tvl_near"),
        }))
    }

    pub async fn get_snapshots_history(
        &self,
        market_id: &str,
        limit: i64,
    ) -> Result<Vec<SnapshotRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT market_id, ts, py_index, implied_apy, underlying_apy,
                   total_pt, total_sy, total_lp, tvl_near
            FROM market_snapshots
            WHERE market_id = $1
            ORDER BY ts ASC
            LIMIT $2;
            "#,
        )
        .bind(market_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let list = rows
            .into_iter()
            .map(|r| SnapshotRecord {
                market_id: r.get("market_id"),
                ts: r.get("ts"),
                py_index: r.get("py_index"),
                implied_apy: r.get("implied_apy"),
                underlying_apy: r.get("underlying_apy"),
                total_pt: r.get("total_pt"),
                total_sy: r.get("total_sy"),
                total_lp: r.get("total_lp"),
                tvl_near: r.get("tvl_near"),
            })
            .collect();

        Ok(list)
    }

    #[allow(dead_code)]
    pub async fn insert_event(
        &self,
        market_id: &str,
        receipt_id: Option<&str>,
        event_type: &str,
        account_id: &str,
        data_json: &Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO events (market_id, receipt_id, event_type, account_id, data_json)
            VALUES ($1, $2, $3, $4, $5);
            "#,
        )
        .bind(market_id)
        .bind(receipt_id)
        .bind(event_type)
        .bind(account_id)
        .bind(data_json)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_events(
        &self,
        market_id: &str,
        limit: i64,
    ) -> Result<Vec<EventRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, market_id, receipt_id, event_type, account_id, data_json, ts
            FROM events
            WHERE market_id = $1
            ORDER BY ts DESC
            LIMIT $2;
            "#,
        )
        .bind(market_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let list = rows
            .into_iter()
            .map(|r| EventRecord {
                id: r.get("id"),
                market_id: r.get("market_id"),
                receipt_id: r.get("receipt_id"),
                event_type: r.get("event_type"),
                account_id: r.get("account_id"),
                data_json: r.get("data_json"),
                ts: r.get("ts"),
            })
            .collect();

        Ok(list)
    }
}
