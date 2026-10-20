-- 财富模拟器多方案：{ active_id, draft, plans[] } JSON。可空，向后兼容。
ALTER TABLE user_config ADD COLUMN simulator_plans TEXT;
