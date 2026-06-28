-- ============================================================================
-- Seed 模板数据 — 给 sanuei.yann@gmail.com (bc8720b4) 添加完整演示数据
-- 用途: 展示所有功能(现金走势曲线、收支环形图、卡片布局等)
-- 用法: cd apps/api && wrangler d1 execute cash-flow-pulse-db --remote --file=../../scripts/seed_sanuei.sql
-- ============================================================================

-- 1) user_config
INSERT OR REPLACE INTO user_config (user_id, pay_day, snapshot_offsets, weekend_shift, created_at, updated_at)
VALUES ('bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', 10, '[0,7,14,21]', 0,
        strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- 2) 现金账户
INSERT OR REPLACE INTO cash_sources (id, user_id, name, balance, locked_amount, sort_order, created_at, updated_at) VALUES
  ('cs-paypay-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', 'PayPay', 45000, 0, 0,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('cs-wallet-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '钱包', 30000, 0, 1,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('cs-mitsubishi-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '三菱银行', 195000, 30000, 2,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- 3) 信用卡(3 张,体现日常消费)
INSERT OR REPLACE INTO credit_cards (id, user_id, name, statement_amount, due_day, monthly_statements, sort_order, created_at, updated_at) VALUES
  ('cc-rakuten-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '乐天信用卡', 0, 27, '{"2026-06": 28000}', 0,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('cc-paypay-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', 'paypay信用卡', 0, 27, '{"2026-06": 85000}', 1,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('cc-paidy-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', 'paidy', 0, 27, '{"2026-06": 3200}', 2,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- 4) 固定账单
INSERT OR REPLACE INTO recurring_bills (id, user_id, name, amount, due_day, note, sort_order, created_at, updated_at) VALUES
  ('bill-rent-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '房租', 65000, 10, '每月 10 号扣', 0,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('bill-gym-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '健身房', 8800, 14, 'Anytime Fitness', 1,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- 5) 订阅
INSERT OR REPLACE INTO subscriptions (id, user_id, name, amount, billing_day, billing_cycle, category, note, sort_order, created_at, updated_at) VALUES
  ('sub-netflix-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', 'Netflix', 1490, 5, 'monthly', '视频', 'Standard 画质', 0,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('sub-spotify-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', 'Spotify', 980, 20, 'monthly', '音乐', '学生价', 1,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- 6) 投资
INSERT OR REPLACE INTO recurring_investments (id, user_id, name, amount, frequency, start_date, end_date, note, sort_order, created_at, updated_at) VALUES
  ('inv-sp500-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '美股指数 (VOO)', 1200, 'daily', '2025-01-01', NULL, '长期定投', 0,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- 7) 收入
INSERT OR REPLACE INTO recurring_incomes (id, user_id, name, amount, frequency, pay_day, day_of_week, start_date, end_date, note, sort_order, created_at, updated_at) VALUES
  ('inc-salary-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '工资', 280000, 'monthly', 10, NULL, '2025-01-01', NULL, '公司月薪', 0,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('inc-freelance-001', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '副业', 8000, 'monthly', 25, NULL, '2025-01-01', NULL, '设计稿费', 1,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- 8) 快照:最近 7 天(让"现金走势"曲线有数据)
-- 假设今天是 6/28,周期 [6/10, 7/10),生成 6/22-6/28 共 7 条
-- 数据:模拟"工资入账 → 逐渐花销 → 日均预算稳定"的曲线
DELETE FROM snapshots WHERE user_id='bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381';

INSERT INTO snapshots (id, user_id, cycle_id, offset_index, snapshot_date, total_balance, total_locked, total_due, net_available, daily_budget, days_to_payday, note, data_unchanged, total_income, total_investment, total_expense, created_at) VALUES
  ('snap-0622', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '2026-06', 0, '2026-06-22', 278500, 30000, 116200, 132300, 7360, 18, NULL, 0, 288000, 14400, 170100, strftime('%s','now') * 1000),
  ('snap-0623', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '2026-06', 0, '2026-06-23', 273200, 30000, 116200, 127000, 7480, 17, NULL, 0, 288000, 15600, 175400, strftime('%s','now') * 1000),
  ('snap-0624', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '2026-06', 0, '2026-06-24', 268400, 30000, 116200, 122200, 7620, 16, NULL, 0, 288000, 16800, 181200, strftime('%s','now') * 1000),
  ('snap-0625', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '2026-06', 0, '2026-06-25', 262800, 30000, 116200, 116600, 7780, 15, NULL, 0, 288000, 18000, 189000, strftime('%s','now') * 1000),
  ('snap-0626', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '2026-06', 0, '2026-06-26', 258600, 30000, 116200, 112400, 8010, 14, NULL, 0, 288000, 19200, 194200, strftime('%s','now') * 1000),
  ('snap-0627', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '2026-06', 0, '2026-06-27', 252100, 30000, 116200, 105900, 8170, 13, NULL, 0, 288000, 20400, 202100, strftime('%s','now') * 1000),
  ('snap-0628', 'bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381', '2026-06', 0, '2026-06-28', 248000, 30000, 116200, 101800, 8390, 12, NULL, 0, 288000, 21600, 208200, strftime('%s','now') * 1000);

-- 校验查询已移到 scripts/seed_verify.sql(SQLite 限制 compound SELECT ≤ 4)
