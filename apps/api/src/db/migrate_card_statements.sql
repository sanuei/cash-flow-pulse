-- 迁移：信用卡按月账单金额覆盖表
-- 新增 monthly_statements 列（JSON：{"YYYY-MM": amount}），默认空对象。
-- 已有卡片保留 statement_amount 作为未单独设置月份的默认值，行为不变。
ALTER TABLE credit_cards ADD COLUMN monthly_statements TEXT NOT NULL DEFAULT '{}';
