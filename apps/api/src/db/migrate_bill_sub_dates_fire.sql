-- 固定账单 / 订阅：生效区间 [start_date, end_date)，用于「从某天起生效」改金额而不改写历史。
-- 两列都可空：NULL = 不限（旧数据保持原行为：一直有效）
ALTER TABLE recurring_bills ADD COLUMN start_date TEXT;
ALTER TABLE recurring_bills ADD COLUMN end_date TEXT;
ALTER TABLE subscriptions ADD COLUMN start_date TEXT;
ALTER TABLE subscriptions ADD COLUMN end_date TEXT;

-- 财务自由参数（JSON：{ withdrawalRatePct, annualReturnPct, annualSpendOverride }），NULL = 用默认值
ALTER TABLE user_config ADD COLUMN fire_settings TEXT;
