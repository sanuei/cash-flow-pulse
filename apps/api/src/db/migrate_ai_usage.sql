-- AI 诊断每日用量计数（限流用）
-- 每用户每天一行，count 累加；跨天自然新行。
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL,
  date    TEXT NOT NULL,               -- YYYY-MM-DD（应用时区的当天）
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
