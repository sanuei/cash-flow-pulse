-- AI 诊断：结构化健康指标（图表用）。存 JSON 数组：[{key,label,valueText,status,target,bar}]
ALTER TABLE ai_diagnoses ADD COLUMN metrics_json TEXT;
