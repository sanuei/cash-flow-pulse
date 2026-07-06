-- 迁移：临时账单（一次性支出）
-- 新增 one_off_expenses 表：绑定具体日期的一次性支出。
-- 月份归属由 date 落在哪个发薪周期决定；date 同时是逐日现金流曲线的扣款点。
CREATE TABLE IF NOT EXISTS one_off_expenses (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT 'default',
  name        TEXT NOT NULL,
  amount      REAL NOT NULL CHECK (amount >= 0),
  date        TEXT NOT NULL,
  note        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_one_off_user ON one_off_expenses(user_id);
