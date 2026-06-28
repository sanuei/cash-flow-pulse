-- 迁移：user_config 增加 weekend_shift 列
-- 扣款日遇周六/日时顺延至下一个工作日（周一）。0=关闭（默认），1=开启。
ALTER TABLE user_config ADD COLUMN weekend_shift INTEGER NOT NULL DEFAULT 0;
