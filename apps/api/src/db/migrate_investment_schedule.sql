-- 迁移：定投扣款日锚点
-- 每月定投用 pay_day(1-31)，每周定投用 day_of_week(0-6=周日..周六)。
-- 已有定投这两列为 NULL：calc 回退到 start_date 的日/星期，行为不变。
ALTER TABLE recurring_investments ADD COLUMN pay_day INTEGER;
ALTER TABLE recurring_investments ADD COLUMN day_of_week INTEGER;
