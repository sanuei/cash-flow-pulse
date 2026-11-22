-- 持仓成本（用于收益率）：总成本 + 成本币种（空 = 日元）
ALTER TABLE holdings ADD COLUMN cost_basis REAL;
ALTER TABLE holdings ADD COLUMN cost_currency TEXT;
