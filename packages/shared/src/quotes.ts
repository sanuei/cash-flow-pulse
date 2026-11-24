/**
 * 持仓自动估值：行情解析 + 折算日元（纯函数，前后端共用，Worker 里的抓取逻辑见 apps/api/src/lib/quotes.ts）
 *
 * 持仓类型（holding.kind）与行情来源：
 *   market  股票 / ETF / 加密货币 —— Yahoo Finance chart API，symbol 用 Yahoo 代码
 *           （美股 TSLA、日股 8306.T、比特币 BTC-JPY），价格 = 每股（币）价格，币种随标的
 *   jp_fund 日本投資信託 —— Yahoo!ファイナンス 基金页，symbol 用 8 位「協会コード」（如 03311187），
 *           价格 = 每 1 万口的基準価額（円），数量填「口数」
 *   cn_fund 中国公募基金（支付宝/天天基金）—— 东方财富净值接口，symbol 用 6 位基金代码，
 *           价格 = 单位净值（人民币），数量填「份额」
 *   manual  手动金额（证券账户里的现金等）—— 不抓行情，quantity 直接是日元金额
 * 外币按 Yahoo 汇率（如 USDJPY=X）折算成日元。
 */

export type HoldingKind = 'market' | 'jp_fund' | 'cn_fund' | 'manual';
export const HOLDING_KINDS: HoldingKind[] = ['market', 'jp_fund', 'cn_fund', 'manual'];

export interface Holding {
  id: string;
  user_id: string;
  asset_id: string;        // 所属「其他资产」（如 PayPay証券 账户）
  kind: HoldingKind;
  symbol: string;          // market: Yahoo 代码；jp_fund: 協会コード；cn_fund: 6 位代码；manual: ''
  name: string;            // 添加时从行情源取回的名称，便于核对代码是否填对
  quantity: number;        // 股数 / 口数 / 份额；manual 为日元金额
  bucket: string | null;   // 资金配置类别 key（用于「闲置资金怎么投」），可空
  cost_basis?: number | null;    // 总成本（买入时一共花了多少），空 = 没填，不算收益
  cost_currency?: string | null; // 成本币种：空/JPY = 日元成本（含汇率损益，和日本券商的「評価損益」一致）；
                                 // 填标的币种（如 USD）= 按外币算收益（和 moomoo 等外币账户显示一致）
  sort_order: number;
  created_at: number;
  updated_at: number;
}

/** 行情缓存（全局共享，按 kind+symbol；汇率用 kind='fx'，symbol 如 'USDJPY=X'） */
export interface Quote {
  kind: HoldingKind | 'fx';
  symbol: string;
  name: string | null;
  price: number | null;      // 最近一次成功的价格（失败时保留上次值）
  currency: string | null;   // 价格币种（ISO，如 USD / JPY / CNY）
  price_date: string | null; // 行情对应日期 YYYY-MM-DD（基金为净值日）
  instrument_type: string | null; // 品种：EQUITY / ETF / CRYPTOCURRENCY / MUTUALFUND / FUND（日本投信、中国基金）
  fetched_at: number;        // 最近一次尝试抓取的时间（ms）
  error: string | null;      // 最近一次抓取失败原因；成功为 null
}

export type ParsedQuote = { price: number; currency: string; name: string | null; priceDate: string | null; instrumentType: string | null };

const toNum = (s: unknown): number => {
  const n = typeof s === 'number' ? s : Number(String(s ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) throw new Error('价格无效');
  return n;
};

const isoDateFromUnix = (sec: unknown, tzOffsetSec = 0): string | null => {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return null;
  return new Date((sec + tzOffsetSec) * 1000).toISOString().slice(0, 10);
};

/**
 * Yahoo Finance chart API（/v8/finance/chart/{symbol}）。
 * 部分市场用「辅币」计价（伦敦 GBp = 便士、南非 ZAc、以色列 ILA）→ 换成主币。
 */
export function parseYahooChart(json: any): ParsedQuote {
  const err = json?.chart?.error;
  if (err) throw new Error(err.description || err.code || '找不到该代码');
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('找不到该代码');
  let price = toNum(meta.regularMarketPrice);
  let currency = String(meta.currency || '').trim();
  if (!currency) throw new Error('缺少币种');
  const minor: Record<string, string> = { GBp: 'GBP', GBX: 'GBP', ZAc: 'ZAR', ILA: 'ILS' };
  if (minor[currency]) { price = price / 100; currency = minor[currency]!; }
  return {
    price,
    currency: currency.toUpperCase(),
    name: meta.longName || meta.shortName || null,
    priceDate: isoDateFromUnix(meta.regularMarketTime, typeof meta.gmtoffset === 'number' ? meta.gmtoffset : 0),
    instrumentType: typeof meta.instrumentType === 'string' ? meta.instrumentType : null,
  };
}

/**
 * Yahoo!ファイナンス 投資信託页（finance.yahoo.co.jp/quote/{協会コード}）。
 * 页面内嵌的 Next.js 数据里有 priceBoard：{ code, name, price: { value: "42,207", updateDate: "11/20" } }。
 * 必须校验 code 与请求一致（页面里还有其他基金的推荐列表）。
 */
export function parseYahooJpFundPage(html: string, code: string, today = new Date()): ParsedQuote {
  const s = html.replace(/\\"/g, '"').replace(/\\u0026/g, '&');
  const m = s.match(/"priceBoard":\{"code":"([0-9A-Z]+)","name":"([^"]*)"[\s\S]*?"price":\{"value":"([\d,.]+)"[^}]*?"updateDate":"(\d{1,2})\/(\d{1,2})"/);
  if (!m || m[1] !== code) throw new Error('找不到该協会コード');
  const month = Number(m[4]);
  const day = Number(m[5]);
  // updateDate 只有月/日：比今天还晚的月份说明是去年（如 1 月初看到 12/30）
  let year = today.getFullYear();
  if (month > today.getMonth() + 1) year -= 1;
  return {
    price: toNum(m[3]),
    currency: 'JPY',
    name: m[2]!.replace(/&amp;/g, '&') || null,
    priceDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    instrumentType: 'FUND',
  };
}

/**
 * みんかぶ投資信託（itf.minkabu.jp/fund/{協会コード}）—— Yahoo!ファイナンス 拒绝 Cloudflare 出口（403）时的备用源。
 * 页面：<link rel="canonical" href=".../fund/{code}"> + 「基準価額 <time datetime="YYYY-MM-DD"> … <span class="text-4xl font-bold">42,207</span>」
 */
export function parseMinkabuFundPage(html: string, code: string): ParsedQuote {
  const canon = html.match(/<link rel="canonical" href="[^"]*\/fund\/([0-9A-Z]+)"/);
  if (!canon || canon[1] !== code) throw new Error('找不到该協会コード');
  const m = html.match(/基準価額<\/p>\s*<p>\s*<time datetime="(\d{4}-\d{2}-\d{2})">[\s\S]*?<span class="text-4xl font-bold">([\d,.]+)<\/span>/);
  if (!m) throw new Error('页面里没有基準価額');
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  return {
    price: toNum(m[2]),
    currency: 'JPY',
    name: h1 ? h1[1]!.normalize('NFKC').trim() : null,   // 全角 → 半角（ｅＭＡＸＩＳ → eMAXIS）
    priceDate: m[1]!,
    instrumentType: 'FUND',
  };
}

/** 东方财富历史净值（api.fund.eastmoney.com/f10/lsjz?fundCode=…&pageSize=1）：最新一条的单位净值 */
export function parseEastmoneyNav(json: any): ParsedQuote {
  const row = json?.Data?.LSJZList?.[0];
  if (!row) throw new Error('找不到该基金代码');
  return { price: toNum(row.DWJZ), currency: 'CNY', name: null, priceDate: typeof row.FSRQ === 'string' ? row.FSRQ : null, instrumentType: 'FUND' };
}

/** 币种 → Yahoo 汇率代码（日元不需要） */
export function fxSymbol(currency: string): string | null {
  const c = currency.toUpperCase();
  return c === 'JPY' ? null : `${c}JPY=X`;
}

export const quoteKey = (kind: string, symbol: string) => `${kind}:${symbol}`;

/**
 * 单个持仓的日元市值。行情或汇率缺失 → null（调用方保留该资产的旧值，不当作 0）。
 * fx：币种 → 1 单位外币兑日元（如 { USD: 154.2, CNY: 21.7 }）
 */
export function holdingValueJpy(
  h: Pick<Holding, 'kind' | 'quantity'>,
  quote: Pick<Quote, 'price' | 'currency'> | undefined,
  fx: Record<string, number>,
): number | null {
  if (h.kind === 'manual') return h.quantity;
  if (!quote || quote.price == null || !quote.currency) return null;
  const units = h.kind === 'jp_fund' ? h.quantity / 10000 : h.quantity; // 基準価額是每 1 万口
  const local = units * quote.price;
  const cur = quote.currency.toUpperCase();
  if (cur === 'JPY') return local;
  const rate = fx[cur];
  return rate && rate > 0 ? local * rate : null;
}

/**
 * 一个资产下所有持仓的合计市值。任一持仓缺行情 → complete=false（总值只含可估的部分，
 * 调用方据此决定是否覆盖资产的旧值）。
 */
export function valueHoldings(
  holdings: Pick<Holding, 'kind' | 'symbol' | 'quantity'>[],
  quotes: Map<string, Pick<Quote, 'price' | 'currency'>>,
  fx: Record<string, number>,
): { total: number; complete: boolean } {
  let total = 0;
  let complete = true;
  for (const h of holdings) {
    const v = holdingValueJpy(h, quotes.get(quoteKey(h.kind, h.symbol)), fx);
    if (v === null) complete = false;
    else total += v;
  }
  return { total: Math.round(total), complete };
}

export type HoldingReturn = {
  cost: number;       // 成本（日元；外币成本按当前汇率折算）
  value: number;      // 市值（日元）
  gain: number;       // 收益（日元）
  pct: number;        // 收益率 %（外币成本时按外币计算，不含汇率变化）
};

/**
 * 单个持仓的收益。没填成本、行情/汇率缺失、manual 现金 → null。
 *   成本是日元：收益 = 日元市值 − 成本（含汇率损益）
 *   成本是外币（= 标的币种）：收益率按外币算；收益金额按当前汇率折成日元
 */
export function holdingReturn(
  h: Pick<Holding, 'kind' | 'quantity' | 'cost_basis' | 'cost_currency'>,
  quote: Pick<Quote, 'price' | 'currency'> | undefined,
  fx: Record<string, number>,
): HoldingReturn | null {
  if (h.kind === 'manual' || h.cost_basis == null || !(h.cost_basis > 0)) return null;
  const value = holdingValueJpy(h, quote, fx);
  if (value == null) return null;
  const cc = (h.cost_currency || 'JPY').toUpperCase();
  if (cc === 'JPY') {
    const gain = value - h.cost_basis;
    return { cost: h.cost_basis, value, gain, pct: (gain / h.cost_basis) * 100 };
  }
  const qc = (quote?.currency || '').toUpperCase();
  const rate = fx[cc];
  if (cc !== qc || !rate) return null; // 成本币种和标的币种不一致：无法比较
  const units = h.kind === 'jp_fund' ? h.quantity / 10000 : h.quantity;
  const local = units * quote!.price!;
  const gainLocal = local - h.cost_basis;
  return { cost: h.cost_basis * rate, value, gain: gainLocal * rate, pct: (gainLocal / h.cost_basis) * 100 };
}

/** 多个持仓合计收益：只统计填了成本的；covered = 参与统计的市值，total = 全部可估市值（不含现金） */
export function sumReturns(
  holdings: Pick<Holding, 'kind' | 'symbol' | 'quantity' | 'cost_basis' | 'cost_currency'>[],
  quotes: Map<string, Pick<Quote, 'price' | 'currency'>>,
  fx: Record<string, number>,
): { cost: number; gain: number; pct: number | null; covered: number; total: number; count: number; missing: number } {
  let cost = 0, gain = 0, covered = 0, total = 0, count = 0, missing = 0;
  for (const h of holdings) {
    if (h.kind === 'manual') continue;
    const q = quotes.get(quoteKey(h.kind, h.symbol));
    const v = holdingValueJpy(h, q, fx);
    if (v != null) total += v;
    const r = holdingReturn(h, q, fx);
    if (r) { cost += r.cost; gain += r.gain; covered += r.value; count++; }
    else if (v != null) missing++;
  }
  return { cost, gain, pct: cost > 0 ? (gain / cost) * 100 : null, covered, total, count, missing };
}
