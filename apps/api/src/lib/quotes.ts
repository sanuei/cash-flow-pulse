/**
 * 行情抓取 + 持仓估值（Worker 端）
 *
 * - 行情按 (kind, symbol) 全局缓存在 quotes 表；同一只股票多个用户只抓一次
 * - 每小时 cron 刷新（股票/汇率 50 分钟过期；基金每天才更新一次净值，3 小时过期）
 * - 抓取失败保留上次价格，只记录 error，不把资产价值清零
 * - 有持仓的「其他资产」，价值 = 持仓市值合计（全部持仓都有行情时才覆盖）
 */
import {
  parseYahooChart, parseYahooJpFundPage, parseEastmoneyNav, fxSymbol, quoteKey, valueHoldings,
  type HoldingKind, type ParsedQuote, type Quote,
} from '@cfp/shared';

const UA = 'Mozilla/5.0 (compatible; CashFlowPulse/1.0; +https://cashflow.soniclab.cc)';
const TIMEOUT_MS = 10_000;
/** 每次运行最多抓多少个行情（Workers 免费版单次调用 50 个子请求上限，留余量给 D1） */
const MAX_FETCH_PER_RUN = 35;

const SYMBOL_RULES: Record<Exclude<HoldingKind, 'manual'> | 'fx', RegExp> = {
  market: /^[A-Za-z0-9.\-^=]{1,20}$/,
  fx: /^[A-Z]{3}JPY=X$/,
  jp_fund: /^[0-9A-Z]{8}$/,
  cn_fund: /^\d{6}$/,
};

export function normalizeSymbol(kind: HoldingKind | 'fx', raw: string): string {
  const s = raw.trim();
  if (kind === 'manual') return '';
  const v = kind === 'market' ? s.toUpperCase() : kind === 'jp_fund' ? s.toUpperCase() : s;
  if (!SYMBOL_RULES[kind].test(v)) {
    throw new Error(
      kind === 'jp_fund' ? '協会コード应为 8 位（如 03311187）'
      : kind === 'cn_fund' ? '基金代码应为 6 位数字'
      : '代码格式不对（如 TSLA、8306.T、BTC-JPY）',
    );
  }
  return v;
}

async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) throw new Error('找不到该代码');
  if (!res.ok) throw new Error(`行情源返回 ${res.status}`);
  return res;
}

/** 抓一个行情（不写库） */
export async function fetchQuote(kind: HoldingKind | 'fx', symbol: string): Promise<ParsedQuote> {
  switch (kind) {
    case 'market':
    case 'fx': {
      const res = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
      return parseYahooChart(await res.json());
    }
    case 'jp_fund': {
      const res = await get(`https://finance.yahoo.co.jp/quote/${encodeURIComponent(symbol)}`);
      return parseYahooJpFundPage(await res.text(), symbol, jstNow());
    }
    case 'cn_fund': {
      const res = await get(
        `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${symbol}&pageIndex=1&pageSize=1`,
        { Referer: 'https://fundf10.eastmoney.com/' },
      );
      const q = parseEastmoneyNav(await res.json());
      if (!q.name) q.name = (await searchCnFunds(symbol)).find((r) => r.symbol === symbol)?.name ?? null;
      return q;
    }
    default:
      throw new Error('该类型不需要行情');
  }
}

export type SearchResult = { symbol: string; name: string; exchange: string | null; type: string | null };

/** 股票/ETF/加密货币：Yahoo 搜索 */
export async function searchMarket(q: string): Promise<SearchResult[]> {
  const res = await get(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`);
  const json: any = await res.json();
  return (json?.quotes ?? [])
    .filter((x: any) => x?.symbol && ['EQUITY', 'ETF', 'CRYPTOCURRENCY', 'MUTUALFUND', 'INDEX'].includes(x.quoteType))
    .map((x: any) => ({
      symbol: String(x.symbol),
      name: String(x.longname || x.shortname || x.symbol),
      exchange: x.exchDisp ?? null,
      type: x.typeDisp ?? x.quoteType ?? null,
    }));
}

/** 中国基金：天天基金搜索（名称或代码） */
export async function searchCnFunds(q: string): Promise<SearchResult[]> {
  const res = await get(`https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(q)}`);
  const json: any = await res.json();
  return (json?.Datas ?? [])
    .filter((x: any) => /^\d{6}$/.test(String(x?.CODE ?? '')) && x?.CATEGORYDESC === '基金')
    .slice(0, 8)
    .map((x: any) => ({ symbol: String(x.CODE), name: String(x.NAME), exchange: null, type: x.FundBaseInfo?.FTYPE ?? null }));
}

/** 日本时间的「现在」（Worker 运行在 UTC；用于基金净值日期的年份推断、资产记录日期） */
export function jstNow(): Date {
  const d = new Date(Date.now() + 9 * 3600_000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
}
export function jstDateStr(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

const staleAfter = (kind: string) => (kind === 'jp_fund' || kind === 'cn_fund' ? 3 : 50 / 60) * 3600_000;

/** 抓取并写入一个行情；失败保留旧价格、记录 error。返回写入后的行 */
export async function upsertQuote(db: D1Database, kind: HoldingKind | 'fx', symbol: string, prev?: Quote): Promise<Quote> {
  const ts = Date.now();
  let row: Quote;
  try {
    const q = await fetchQuote(kind, symbol);
    row = {
      kind, symbol, name: q.name ?? prev?.name ?? null, price: q.price, currency: q.currency, price_date: q.priceDate,
      instrument_type: q.instrumentType ?? prev?.instrument_type ?? null, fetched_at: ts, error: null,
    };
  } catch (e: any) {
    row = {
      kind, symbol, name: prev?.name ?? null, price: prev?.price ?? null, currency: prev?.currency ?? null,
      price_date: prev?.price_date ?? null, instrument_type: prev?.instrument_type ?? null,
      fetched_at: ts, error: String(e?.message || e).slice(0, 200),
    };
  }
  await db.prepare(
    `INSERT INTO quotes (kind, symbol, name, price, currency, price_date, instrument_type, fetched_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, symbol) DO UPDATE SET name=excluded.name, price=excluded.price, currency=excluded.currency,
       price_date=excluded.price_date, instrument_type=excluded.instrument_type, fetched_at=excluded.fetched_at, error=excluded.error`,
  ).bind(row.kind, row.symbol, row.name, row.price, row.currency, row.price_date, row.instrument_type, row.fetched_at, row.error).run();
  return row;
}

async function loadQuotes(db: D1Database): Promise<Map<string, Quote>> {
  const rows = await db.prepare('SELECT * FROM quotes').all<Quote>();
  return new Map((rows.results || []).map((q) => [quoteKey(q.kind, q.symbol), q]));
}

/** 并发抓取，限制同时进行的请求数 */
async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<unknown>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

/**
 * 刷新行情并重算资产价值。
 *   userId 省略 = 全部用户（cron）；force = 忽略过期时间（用户手动点刷新，仍有 2 分钟最小间隔）
 */
export async function refreshHoldings(db: D1Database, opts: { userId?: string; force?: boolean } = {}) {
  const now = Date.now();
  const holdingRows = await (opts.userId
    ? db.prepare("SELECT DISTINCT kind, symbol FROM holdings WHERE user_id = ? AND kind != 'manual'").bind(opts.userId)
    : db.prepare("SELECT DISTINCT kind, symbol FROM holdings WHERE kind != 'manual'")
  ).all<{ kind: HoldingKind; symbol: string }>();
  const quotes = await loadQuotes(db);

  const isDue = (kind: string, symbol: string) => {
    const q = quotes.get(quoteKey(kind, symbol));
    if (!q) return true;
    const age = now - q.fetched_at;
    return opts.force ? age > 2 * 60_000 : age > staleAfter(kind);
  };

  // 1) 持仓行情（最久没更新的优先）
  const due = (holdingRows.results || [])
    .filter((h) => isDue(h.kind, h.symbol))
    .sort((a, b) => (quotes.get(quoteKey(a.kind, a.symbol))?.fetched_at ?? 0) - (quotes.get(quoteKey(b.kind, b.symbol))?.fetched_at ?? 0))
    .slice(0, MAX_FETCH_PER_RUN);
  await pool(due, 6, async (h) => {
    quotes.set(quoteKey(h.kind, h.symbol), await upsertQuote(db, h.kind, h.symbol, quotes.get(quoteKey(h.kind, h.symbol))));
  });

  // 2) 汇率：所有用到的外币
  const currencies = new Set<string>();
  for (const h of holdingRows.results || []) {
    const c = quotes.get(quoteKey(h.kind, h.symbol))?.currency;
    if (c) currencies.add(c.toUpperCase());
  }
  const fxDue = [...currencies].map(fxSymbol).filter((s): s is string => !!s && isDue('fx', s));
  await pool(fxDue, 6, async (s) => {
    quotes.set(quoteKey('fx', s), await upsertQuote(db, 'fx', s, quotes.get(quoteKey('fx', s))));
  });

  await revalueAssets(db, quotes, opts.userId);
  return { fetched: due.length + fxDue.length };
}

export function fxRates(quotes: Map<string, Quote>): Record<string, number> {
  const fx: Record<string, number> = {};
  for (const q of quotes.values()) {
    if (q.kind === 'fx' && q.price) fx[q.symbol.slice(0, 3)] = q.price;
  }
  return fx;
}

/** 按持仓重算「其他资产」价值（全部持仓都有行情时才覆盖，避免缺一个价格就把资产算少） */
export async function revalueAssets(db: D1Database, quotes?: Map<string, Quote>, userId?: string, assetId?: string) {
  const qs = quotes ?? await loadQuotes(db);
  const fx = fxRates(qs);
  const where = assetId ? 'WHERE asset_id = ?' : userId ? 'WHERE user_id = ?' : '';
  const stmt = db.prepare(`SELECT asset_id, user_id, kind, symbol, quantity FROM holdings ${where}`);
  const rows = await (assetId ? stmt.bind(assetId) : userId ? stmt.bind(userId) : stmt).all<any>();
  const byAsset = new Map<string, { userId: string; items: any[] }>();
  for (const r of rows.results || []) {
    const g = byAsset.get(r.asset_id) ?? { userId: r.user_id as string, items: [] as any[] };
    g.items.push(r);
    byAsset.set(r.asset_id, g);
  }
  const updates: D1PreparedStatement[] = [];
  for (const [id, g] of byAsset) {
    const { total, complete } = valueHoldings(g.items, qs, fx);
    if (complete) updates.push(db.prepare('UPDATE other_assets SET value = ? WHERE id = ? AND user_id = ?').bind(total, id, g.userId));
  }
  if (updates.length) await db.batch(updates);
}

/**
 * 记录今天（日本时间）的资产：现金 = 现金账户余额合计；投资 = 股票/基金 + 加密货币；其他 = 房产等。
 * 每小时覆盖当天这一行，最终保留当天最后一次的值。
 */
export async function recordAssetHistory(db: D1Database, userId?: string) {
  const date = jstDateStr();
  const ts = Date.now();
  await db.prepare(
    `INSERT INTO asset_history (user_id, date, cash, invest, other, created_at)
     SELECT u.id, ?,
       COALESCE((SELECT SUM(balance) FROM cash_sources c WHERE c.user_id = u.id), 0),
       COALESCE((SELECT SUM(value) FROM other_assets o WHERE o.user_id = u.id AND o.category IN ('stock','crypto')), 0),
       COALESCE((SELECT SUM(value) FROM other_assets o WHERE o.user_id = u.id AND o.category NOT IN ('stock','crypto')), 0),
       ?
     FROM users u WHERE ${userId ? 'u.id = ?' : '1'}  -- WHERE 必须有：否则 SQLite 把下面的 ON 当成 JOIN 条件
     ON CONFLICT(user_id, date) DO UPDATE SET
       cash = excluded.cash, invest = excluded.invest, other = excluded.other, created_at = excluded.created_at`,
  ).bind(...(userId ? [date, ts, userId] : [date, ts])).run();
}
