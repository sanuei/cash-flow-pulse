-- 持仓自动估值 + 资产走势 + 资金配置目标
-- 全部是新表 / 加可空列，向后兼容：旧代码不受影响

-- 持仓：挂在某个「其他资产」（如 PayPay証券 账户）下面；有持仓的资产，价值由行情自动计算
CREATE TABLE IF NOT EXISTS holdings (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  asset_id    TEXT NOT NULL,                 -- other_assets.id
  kind        TEXT NOT NULL CHECK (kind IN ('market','jp_fund','cn_fund','manual')),
  symbol      TEXT NOT NULL DEFAULT '',      -- Yahoo 代码 / 協会コード / 6 位基金代码；manual 为空
  name        TEXT NOT NULL DEFAULT '',
  quantity    REAL NOT NULL CHECK (quantity >= 0),  -- 股数 / 口数 / 份额；manual 为日元金额
  bucket      TEXT,                          -- 资金配置类别 key（见 user_config.allocation_targets），可空
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_asset ON holdings(asset_id);

-- 行情缓存（全局共享，不含用户数据）；汇率 kind='fx'，symbol 如 USDJPY=X
CREATE TABLE IF NOT EXISTS quotes (
  kind        TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  name        TEXT,
  price       REAL,
  currency    TEXT,
  price_date  TEXT,
  instrument_type TEXT,                      -- 品种：EQUITY / ETF / CRYPTOCURRENCY / FUND（用于资产结构分析）
  fetched_at  INTEGER NOT NULL,
  error       TEXT,
  PRIMARY KEY (kind, symbol)
);

-- 每日资产记录（首页资产走势）：现金（净可用）、投资（股票/基金/加密）、其他（房产等）
CREATE TABLE IF NOT EXISTS asset_history (
  user_id     TEXT NOT NULL,
  date        TEXT NOT NULL,                 -- YYYY-MM-DD（日本时间）
  cash        REAL NOT NULL DEFAULT 0,
  invest      REAL NOT NULL DEFAULT 0,
  other       REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);

-- 资金配置目标 JSON：[{ "key": "us_index", "label": "美股指数基金", "pct": 50 }, ...]
ALTER TABLE user_config ADD COLUMN allocation_targets TEXT;
