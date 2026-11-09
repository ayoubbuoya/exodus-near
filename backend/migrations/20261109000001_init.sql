-- Exodus Backend PostgreSQL Schema
-- Migration 001: Initial setup

CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    contract_id TEXT UNIQUE NOT NULL,
    lst_id TEXT NOT NULL,
    network TEXT NOT NULL,
    expiry_ns BIGINT NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_snapshots (
    market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    py_index TEXT NOT NULL,
    implied_apy TEXT NOT NULL,
    underlying_apy TEXT NOT NULL,
    total_pt TEXT NOT NULL,
    total_sy TEXT NOT NULL,
    total_lp TEXT NOT NULL,
    tvl_near TEXT NOT NULL,
    PRIMARY KEY (market_id, ts)
);

CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    receipt_id TEXT,
    event_type TEXT NOT NULL,
    account_id TEXT NOT NULL,
    data_json JSONB NOT NULL,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_market_ts ON market_snapshots(market_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_market_ts ON events(market_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_account ON events(account_id);
