-- AI 诊断历史记录（保留每次诊断结果，可回看/对比趋势）
CREATE TABLE IF NOT EXISTS ai_diagnoses (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  cycle_id   TEXT NOT NULL,       -- 诊断针对的发薪周期
  model      TEXT,                -- 使用的模型
  score      INTEGER,             -- 从分析解析的 0-100 评分（可空）
  analysis   TEXT NOT NULL,       -- Markdown 分析全文
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_diagnoses_user_time
  ON ai_diagnoses(user_id, created_at DESC);
