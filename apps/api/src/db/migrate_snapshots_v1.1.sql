-- Cash Flow Pulse — 快照表 v1.1 迁移
-- 改动：唯一键从 (user_id, cycle_id, offset_index) → (user_id, snapshot_date)
--       新增 3 列：total_income / total_investment / total_expense
--
-- 执行方式（生产前先备份）：
--   wrangler d1 execute cash-flow-pulse-db --file=src/db/migrate_snapshots_v1.1.sql
--
-- 幂等性：用 IF NOT EXISTS / IF EXISTS 保证重跑安全

-- 1. 备份旧数据
CREATE TABLE IF NOT EXISTS snapshots_backup_v10 AS SELECT * FROM snapshots;

-- 2. 重建新表（包含 v1.1 结构）
CREATE TABLE IF NOT EXISTS snapshots_v11 (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  cycle_id        TEXT NOT NULL,
  offset_index    INTEGER NOT NULL DEFAULT 0,
  snapshot_date   TEXT NOT NULL,
  total_balance   REAL NOT NULL,
  total_locked    REAL NOT NULL,
  total_due       REAL NOT NULL,
  net_available   REAL NOT NULL,
  daily_budget    REAL NOT NULL,
  days_to_payday  INTEGER NOT NULL,
  note            TEXT,
  data_unchanged  INTEGER NOT NULL DEFAULT 0,
  total_income    REAL NOT NULL DEFAULT 0,
  total_investment REAL NOT NULL DEFAULT 0,
  total_expense   REAL NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  UNIQUE(user_id, snapshot_date)
);

-- 3. 迁移旧数据（同一 snapshot_date 有多条时保留 offset_index 最大的，即最后录入的）
INSERT OR IGNORE INTO snapshots_v11
  (id, user_id, cycle_id, offset_index, snapshot_date,
   total_balance, total_locked, total_due, net_available, daily_budget,
   days_to_payday, note, data_unchanged,
   total_income, total_investment, total_expense, created_at)
SELECT
  id, user_id, cycle_id, offset_index, snapshot_date,
  total_balance, total_locked, total_due, net_available, daily_budget,
  days_to_payday, note, data_unchanged,
  0, 0, 0, created_at
FROM snapshots
-- 每个 (user_id, snapshot_date) 只取 offset_index 最大的一条
WHERE (user_id, snapshot_date, offset_index) IN (
  SELECT user_id, snapshot_date, MAX(offset_index)
  FROM snapshots
  GROUP BY user_id, snapshot_date
);

-- 4. 原子替换（删旧建新）
DROP TABLE snapshots;
ALTER TABLE snapshots_v11 RENAME TO snapshots;

-- 5. 重建索引
CREATE INDEX IF NOT EXISTS idx_snapshots_cycle ON snapshots(user_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON snapshots(user_id, snapshot_date);
