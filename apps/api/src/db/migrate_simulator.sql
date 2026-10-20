-- 财富模拟器：出生年份 + 用户改过的模拟参数（JSON，只存覆盖项）。两列都可空，向后兼容。
ALTER TABLE user_config ADD COLUMN birth_year INTEGER;
ALTER TABLE user_config ADD COLUMN simulator_settings TEXT;
