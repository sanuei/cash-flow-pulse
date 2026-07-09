-- 迁移：定投频率新增 'single'（临时投资，一次性）
-- SQLite 不能直接改 CHECK 约束，需重建表：建新表 → 拷数据 → 换名。
-- 保留 pay_day/day_of_week（migrate_investment_schedule.sql 已加）。
PRAGMA foreign_keys=OFF;

CREATE TABLE recurring_investments_new (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT 'default',
  name        TEXT NOT NULL,
  amount      REAL NOT NULL CHECK (amount >= 0),
  frequency   TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly','single')),
  pay_day     INTEGER CHECK (pay_day >= 1 AND pay_day <= 31),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_date  TEXT NOT NULL,
  end_date    TEXT,
  note        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

INSERT INTO recurring_investments_new
  (id, user_id, name, amount, frequency, pay_day, day_of_week, start_date, end_date, note, sort_order, created_at, updated_at)
SELECT
  id, user_id, name, amount, frequency, pay_day, day_of_week, start_date, end_date, note, sort_order, created_at, updated_at
FROM recurring_investments;

DROP TABLE recurring_investments;
ALTER TABLE recurring_investments_new RENAME TO recurring_investments;
CREATE INDEX IF NOT EXISTS idx_investments_user ON recurring_investments(user_id);

PRAGMA foreign_keys=ON;
