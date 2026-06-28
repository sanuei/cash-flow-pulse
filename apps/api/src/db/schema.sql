-- Cash Flow Pulse - D1 Schema
-- 适用于 Cloudflare D1（SQLite 兼容）

-- === 用户配置表（V1 单用户）===
CREATE TABLE IF NOT EXISTS user_config (
  user_id        TEXT PRIMARY KEY DEFAULT 'default',
  pay_day        INTEGER NOT NULL DEFAULT 10
                   CHECK (pay_day >= 1 AND pay_day <= 31),
  snapshot_offsets TEXT NOT NULL DEFAULT '[0,7,14,21]',  -- JSON 数组
  weekend_shift  INTEGER NOT NULL DEFAULT 0,             -- 扣款日遇周末顺延至周一（0=关 1=开）
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
  -- 按月账单金额覆盖表（JSON：{"YYYY-MM": amount}），默认空对象
  monthly_statements TEXT NOT NULL DEFAULT '{}',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_user ON credit_cards(user_id);

-- === 快照表（v1.1 重建：唯一键改为 snapshot_date，新增收入/投资/消费字段）===
-- 迁移脚本见 db/migrate_snapshots_v1.1.sql
CREATE TABLE IF NOT EXISTS snapshots (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  cycle_id        TEXT NOT NULL,
  offset_index    INTEGER NOT NULL DEFAULT 0,  -- 手动采集点标记（0=发薪日，自动每日=0）
  snapshot_date   TEXT NOT NULL,
  total_balance   REAL NOT NULL,
  total_locked    REAL NOT NULL,
  total_due       REAL NOT NULL,
  net_available   REAL NOT NULL,
  daily_budget    REAL NOT NULL,
  days_to_payday  INTEGER NOT NULL,
  note            TEXT,
  data_unchanged  INTEGER NOT NULL DEFAULT 0,
  -- v1.1 新增：月度等效收入/投资/消费（用于曲线对比）
  total_income    REAL NOT NULL DEFAULT 0,
  total_investment REAL NOT NULL DEFAULT 0,
  total_expense   REAL NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  UNIQUE(user_id, snapshot_date)  -- 每天一条，自动采集 upsert
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
  frequency     TEXT NOT NULL CHECK (frequency IN ('monthly','weekly','single')),
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
    (frequency = 'weekly'  AND day_of_week IS NOT NULL) OR
    (frequency = 'single')
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

-- ============================================================
-- v1.0 新增表：多用户 + Auth（Google OAuth）
-- ============================================================

-- === 用户表 ===
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,                -- UUID
  email         TEXT NOT NULL UNIQUE,            -- Google 邮箱
  name          TEXT,                            -- Google display name
  picture       TEXT,                            -- 头像 URL
  provider      TEXT NOT NULL DEFAULT 'google',  -- 预留扩展（未来 apple/github）
  provider_sub  TEXT NOT NULL,                   -- Google sub（OAuth unique user ID）
  tier          TEXT NOT NULL DEFAULT 'free',    -- 'free' | 'pro'
  stripe_customer_id TEXT,                        -- Stripe 客户 ID（付费后回填）
  is_admin      INTEGER NOT NULL DEFAULT 0,      -- 创始用户标记（绕过 rate limit）
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_login_at INTEGER,
  UNIQUE(provider, provider_sub)                 -- 同一 provider 内 sub 唯一
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- === 会话表（替代 cookie 内的 JWT，服务端可控）===
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,                -- session UUID（存 HttpOnly cookie）
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    INTEGER NOT NULL,                -- unix ms
  created_at    INTEGER NOT NULL,
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- === Stripe 订阅历史（M1 第二阶段用）===
-- 改名 stripe_subscriptions 避免与上面 v0.3 的 subscriptions 表冲突
CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  tier                 TEXT NOT NULL,            -- 'pro'
  status               TEXT NOT NULL,            -- 'active' | 'canceled' | 'past_due' | 'incomplete'
  current_period_start INTEGER,
  current_period_end   INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stripe_subs_user ON stripe_subscriptions(user_id);
