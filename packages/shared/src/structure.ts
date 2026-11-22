/**
 * 资产结构分析（资产页）：把 现金账户 + 其他资产（含持仓明细）按三种口径拆开
 *   byType   按类型：现金 / 指数基金·ETF / 个股 / 主动基金 / 加密货币 / 股票基金（未明细）/ 房产·其他
 *   byRegion 按投资地区：日本 / 美国 / 全球 / 中国 / 加密货币 / 未明细（基金按名称判断投资地区，不按计价币种）
 *   top      最大的几只持仓（同一代码跨账户合并），看集中度
 * 总额与资产页「现金 + 其他资产」合计一致：有持仓但缺行情的部分记入「未明细」。
 */
import { holdingValueJpy, quoteKey, type Holding, type Quote } from './quotes.js';
import type { CashSource, OtherAsset } from './types.js';

export type StructureSlice = { key: string; label: string; value: number; pct: number };
export type TopHolding = { key: string; name: string; symbol: string; type: string; value: number; pctOfTotal: number; pctOfInvest: number };
export type AssetStructure = {
  total: number;
  invest: number;          // 投资类合计（股票/基金/加密，不含现金、房产）
  byType: StructureSlice[];
  byRegion: StructureSlice[];
  top: TopHolding[];
};

const TYPE_LABEL: Record<string, string> = {
  cash: '现金',
  index: '指数基金·ETF',
  stock: '个股',
  active: '主动基金',
  crypto: '加密货币',
  unknown: '股票/基金（未明细）',
  other: '房产/其他',
};
const TYPE_ORDER = ['cash', 'index', 'stock', 'active', 'crypto', 'unknown', 'other'];

const REGION_LABEL: Record<string, string> = {
  jp: '日本', us: '美国', global: '全球', cn: '中国', crypto: '加密货币', other_region: '其他地区', unknown: '未明细',
};
const REGION_ORDER = ['jp', 'us', 'global', 'cn', 'other_region', 'crypto', 'unknown'];

const INDEX_RE = /インデックス|指数|INDEX|S&P|SP500|NASDAQ|纳斯达克|標普|标普|全世界|オール|ALL.?COUNTRY|TOPIX|日経|NIKKEI|FANG|ダウ|DOW|MSCI/i;
const ACTIVE_RE = /精选|主动|アクティブ|ACTIVE/i;
const isCryptoSymbol = (s: string) => /-(JPY|USD|EUR|USDT)$/i.test(s);

/** 持仓的类型 */
export function holdingType(h: Pick<Holding, 'kind' | 'symbol' | 'name'>, instrumentType?: string | null): string {
  if (h.kind === 'manual') return 'cash';
  if (h.kind === 'jp_fund' || h.kind === 'cn_fund' || instrumentType === 'MUTUALFUND') {
    return INDEX_RE.test(h.name) && !ACTIVE_RE.test(h.name) ? 'index' : 'active';
  }
  if (instrumentType === 'CRYPTOCURRENCY' || isCryptoSymbol(h.symbol)) return 'crypto';
  if (instrumentType === 'ETF') return 'index';
  return 'stock';
}

/** 持仓的投资地区：基金看名称（eMAXIS S&P500 以日元计价，但投的是美国），股票看计价币种 */
export function holdingRegion(h: Pick<Holding, 'kind' | 'symbol' | 'name'>, currency?: string | null, instrumentType?: string | null): string {
  if (h.kind === 'manual') return 'jp';
  if (instrumentType === 'CRYPTOCURRENCY' || isCryptoSymbol(h.symbol)) return 'crypto';
  const n = h.name;
  if (h.kind !== 'market' || instrumentType === 'ETF' || instrumentType === 'MUTUALFUND') {
    if (/全世界|全球|オール|ALL.?COUNTRY|ACWI|先進国|发达市场/i.test(n)) return 'global';
    if (/米国|美国|S&P|SP500|NASDAQ|纳斯达克|标普|FANG|ダウ|DOW/i.test(n)) return 'us';
    if (/中国|沪深|恒生|中证|上证|创业板|港股/i.test(n)) return 'cn';
    if (/日本|TOPIX|日経|NIKKEI|国内/i.test(n)) return 'jp';
  }
  const c = (currency ?? '').toUpperCase();
  if (c === 'JPY') return h.kind === 'cn_fund' ? 'cn' : 'jp';
  if (c === 'USD') return 'us';
  if (c === 'CNY' || c === 'HKD') return 'cn';
  return 'other_region';
}

export function analyzeAssetStructure(opts: {
  cashSources: Pick<CashSource, 'balance'>[];
  otherAssets: Pick<OtherAsset, 'id' | 'category' | 'value'>[];
  holdings: Pick<Holding, 'asset_id' | 'kind' | 'symbol' | 'name' | 'quantity'>[];
  quotes: Map<string, Pick<Quote, 'price' | 'currency' | 'instrument_type'>>;
  fx: Record<string, number>;
  topN?: number;
}): AssetStructure {
  const byType: Record<string, number> = {};
  const byRegion: Record<string, number> = {};
  const add = (m: Record<string, number>, k: string, v: number) => { if (v > 0) m[k] = (m[k] ?? 0) + v; };
  const topMap = new Map<string, { name: string; symbol: string; type: string; value: number }>();

  const cash = opts.cashSources.reduce((s, c) => s + Math.max(0, c.balance), 0);
  add(byType, 'cash', cash);
  add(byRegion, 'jp', cash);

  const holdingsByAsset = new Map<string, typeof opts.holdings>();
  for (const h of opts.holdings) {
    const list = holdingsByAsset.get(h.asset_id) ?? [];
    list.push(h);
    holdingsByAsset.set(h.asset_id, list);
  }

  for (const a of opts.otherAssets) {
    const hs = holdingsByAsset.get(a.id) ?? [];
    if (hs.length === 0) {
      // 没有持仓明细的资产：按资产类别
      const t = a.category === 'crypto' ? 'crypto' : a.category === 'stock' ? 'unknown' : 'other';
      add(byType, t, a.value);
      add(byRegion, t === 'crypto' ? 'crypto' : t === 'unknown' ? 'unknown' : 'jp', a.value);
      continue;
    }
    let known = 0;
    for (const h of hs) {
      const q = opts.quotes.get(quoteKey(h.kind, h.symbol));
      const v = holdingValueJpy(h, q, opts.fx);
      if (v == null || v <= 0) continue;
      known += v;
      add(byType, holdingType(h, q?.instrument_type), v);
      add(byRegion, holdingRegion(h, q?.currency, q?.instrument_type), v);
      if (h.kind !== 'manual') {
        const key = quoteKey(h.kind, h.symbol);
        const cur = topMap.get(key) ?? { name: h.name || h.symbol, symbol: h.symbol, type: holdingType(h, q?.instrument_type), value: 0 };
        cur.value += v;
        topMap.set(key, cur);
      }
    }
    // 缺行情的部分（资产价值保留了上次的合计）记入未明细，保证总额与资产页一致
    const rest = a.value - known;
    if (rest > 1) { add(byType, 'unknown', rest); add(byRegion, 'unknown', rest); }
  }

  const total = Object.values(byType).reduce((s, v) => s + v, 0);
  const invest = ['index', 'stock', 'active', 'crypto', 'unknown'].reduce((s, k) => s + (byType[k] ?? 0), 0);
  const pct = (v: number, of: number) => (of > 0 ? Math.round((v / of) * 1000) / 10 : 0);
  const slices = (m: Record<string, number>, order: string[], labels: Record<string, string>) =>
    order.filter((k) => (m[k] ?? 0) > 0).map((k) => ({ key: k, label: labels[k]!, value: Math.round(m[k]!), pct: pct(m[k]!, total) }));

  return {
    total: Math.round(total),
    invest: Math.round(invest),
    byType: slices(byType, TYPE_ORDER, TYPE_LABEL),
    byRegion: slices(byRegion, REGION_ORDER, REGION_LABEL),
    top: [...topMap.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, opts.topN ?? 5)
      .map(([key, t]) => ({ key, ...t, value: Math.round(t.value), pctOfTotal: pct(t.value, total), pctOfInvest: pct(t.value, invest) })),
  };
}
