-- Cash Flow Pulse - D1 Schema
-- 适用于 Cloudflare D1（SQLite 兼容）

-- === 用户配置表（V1 单用户）===
CREATE TABLE IF NOT EXISTS user_config (
  user_id        TEXT PRIMARY KEY DEFAULT 'default',
  pay_day        INTEGER NOT NULL DEFAULT 10
                   CHECK (pay_day >= 1 AND pay_day <= 31),
  snapshot_offsets TEXT NOT NULL DEFAULT '[0,7,14,21]',  -- JSON 数组
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- 初始化默认配置
INSERT OR IGNORE INTO user_config (user_id, pay_day, snapshot_offsets, created_at, updated_at)
VALUES ('default', 10, '[0,7,14,21]', strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- === 现金来源表 ===
CREATE TABLE IF NOT EXISTS cash_sources (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL DEFAULT 'default',
  name          TEXT NOT NULL,
  balance       REAL NOT NULL DEFAULT 0
                  CHECK (balance >= 0),
  locked_amount REAL NOT NULL DEFAULT 0
                  CHECK (locked_amount >= 0 AND locked_amount <= balance),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cash_user ON cash_sources(user_id);

-- === 信用卡表 ===
CREATE TABLE IF NOT EXISTS credit_cards (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL DEFAULT 'default',
  name             TEXT NOT NULL,
  statement_amount REAL NOT NULL DEFAULT 0
                     CHECK (statement_amount >= 0),
  due_day          INTEGER NOT NULL
                     CHECK (due_day >= 1 AND due_day <= 31),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_user ON credit_cards(user_id);

-- === 快照表 ===
CREATE TABLE IF NOT EXISTS snapshots (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  cycle_id        TEXT NOT NULL,
  offset_index    INTEGER NOT NULL,
  snapshot_date   TEXT NOT NULL,
  total_balance   REAL NOT NULL,
  total_locked    REAL NOT NULL,
  total_due       REAL NOT NULL,
  net_available   REAL NOT NULL,
  daily_budget    REAL NOT NULL,
  days_to_payday  INTEGER NOT NULL,
  note            TEXT,
  data_unchanged  INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  UNIQUE(user_id, cycle_id, offset_index)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_cycle ON snapshots(user_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON snapshots(user_id, snapshot_date);