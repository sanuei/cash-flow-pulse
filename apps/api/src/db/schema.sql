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
-- ============================================================
-- v0.3 新增表
-- ============================================================

-- === 定期投资（每天/每周/每月/每年）===
CREATE TABLE IF NOT EXISTS recurring_investments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT 'default',
  name        TEXT NOT NULL,
  amount      REAL NOT NULL CHECK (amount >= 0),
  frequency   TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly')),
  start_date  TEXT NOT NULL,
  end_date    TEXT,
  note        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_investments_user ON recurring_investments(user_id);

-- === 固定账单（房租水电等）===
CREATE TABLE IF NOT EXISTS recurring_bills (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT 'default',
  name        TEXT NOT NULL,
  amount      REAL NOT NULL CHECK (amount >= 0),
  due_day     INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  note        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bills_user ON recurring_bills(user_id);

-- === 固定收入（工资、副业等）===
CREATE TABLE IF NOT EXISTS recurring_incomes (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL DEFAULT 'default',
  name          TEXT NOT NULL,
  amount        REAL NOT NULL CHECK (amount >= 0),
  frequency     TEXT NOT NULL CHECK (frequency IN ('monthly','weekly')),
  pay_day       INTEGER CHECK (pay_day >= 1 AND pay_day <= 31),
  day_of_week   INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_date    TEXT NOT NULL,
  end_date      TEXT,
  note          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  CHECK (
    (frequency = 'monthly' AND pay_day IS NOT NULL) OR
    (frequency = 'weekly'  AND day_of_week IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_incomes_user ON recurring_incomes(user_id);

-- === 订阅（Netflix/Spotify 等）===
CREATE TABLE IF NOT EXISTS subscriptions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL DEFAULT 'default',
  name          TEXT NOT NULL,
  amount        REAL NOT NULL CHECK (amount >= 0),
  billing_day   INTEGER NOT NULL CHECK (billing_day >= 1 AND billing_day <= 31),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly'
                   CHECK (billing_cycle IN ('monthly','yearly')),
  category      TEXT,
  note          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
