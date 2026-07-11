-- 迁移：其他资产（股票/基金、加密货币、房产等）
-- 手动估值，仅用于资产页净值展示，不参与 net_available / daily_budget 计算。
CREATE TABLE IF NOT EXISTS other_assets (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL DEFAULT 'default',
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'other'
                  CHECK (category IN ('stock','crypto','real_estate','other')),
  value         REAL NOT NULL DEFAULT 0
                  CHECK (value >= 0),
  note          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_other_assets_user ON other_assets(user_id);
