import { describe, it, expect } from 'vitest';
import { analyzeAssetStructure, holdingType, holdingRegion } from './structure';
import { quoteKey } from './quotes';

const q = (price: number, currency: string, instrument_type: string | null) => ({ price, currency, instrument_type });

describe('持仓分类', () => {
  it('类型：个股 / ETF / 加密 / 指数基金 / 主动基金 / 账户现金', () => {
    expect(holdingType({ kind: 'market', symbol: 'TSLA', name: 'Tesla' }, 'EQUITY')).toBe('stock');
    expect(holdingType({ kind: 'market', symbol: 'VOO', name: 'Vanguard S&P 500 ETF' }, 'ETF')).toBe('index');
    expect(holdingType({ kind: 'market', symbol: 'BTC-JPY', name: 'Bitcoin JPY' }, 'CRYPTOCURRENCY')).toBe('crypto');
    expect(holdingType({ kind: 'jp_fund', symbol: '03311187', name: 'eMAXIS Slim米国株式(S&P500)' })).toBe('index');
    expect(holdingType({ kind: 'cn_fund', symbol: '018043', name: '天弘纳斯达克100指数发起(QDII)A' })).toBe('index');
    expect(holdingType({ kind: 'cn_fund', symbol: '017437', name: '华宝纳斯达克精选股票(QDII)A' })).toBe('active');
    expect(holdingType({ kind: 'manual', symbol: '', name: '账户现金' })).toBe('cash');
  });

  it('地区：日元计价的美股基金算美国，オルカン算全球，日股算日本', () => {
    expect(holdingRegion({ kind: 'jp_fund', symbol: '03311187', name: 'eMAXIS Slim米国株式(S&P500)' }, 'JPY')).toBe('us');
    expect(holdingRegion({ kind: 'jp_fund', symbol: '0331418A', name: 'eMAXIS Slim全世界株式(オール･カントリー)' }, 'JPY')).toBe('global');
    expect(holdingRegion({ kind: 'market', symbol: '8306.T', name: 'Mitsubishi UFJ' }, 'JPY', 'EQUITY')).toBe('jp');
    expect(holdingRegion({ kind: 'market', symbol: 'TSLA', name: 'Tesla' }, 'USD', 'EQUITY')).toBe('us');
    expect(holdingRegion({ kind: 'market', symbol: 'BTC-JPY', name: 'Bitcoin' }, 'JPY', 'CRYPTOCURRENCY')).toBe('crypto');
  });
});

describe('资产结构', () => {
  const quotes = new Map([
    [quoteKey('market', 'TSLA'), q(100, 'USD', 'EQUITY')],
    [quoteKey('jp_fund', '03311187'), q(40000, 'JPY', 'FUND')],
    [quoteKey('market', 'BTC-JPY'), q(10_000_000, 'JPY', 'CRYPTOCURRENCY')],
  ]);
  const fx = { USD: 150 };
  const base = {
    cashSources: [{ balance: 1_000_000 }],
    otherAssets: [
      { id: 'pp', category: 'stock' as const, value: 1_000_000 },
      { id: 'mm', category: 'stock' as const, value: 400_000 },
      { id: 'house', category: 'real_estate' as const, value: 0 },
      { id: 'old', category: 'stock' as const, value: 300_000 }, // 没有持仓明细
    ],
    holdings: [
      { asset_id: 'pp', kind: 'market' as const, symbol: 'TSLA', name: 'Tesla', quantity: 20 },         // 300,000
      { asset_id: 'pp', kind: 'jp_fund' as const, symbol: '03311187', name: 'eMAXIS Slim米国株式(S&P500)', quantity: 150_000 }, // 600,000
      { asset_id: 'pp', kind: 'manual' as const, symbol: '', name: '账户现金', quantity: 50_000 },
      { asset_id: 'mm', kind: 'market' as const, symbol: 'TSLA', name: 'Tesla', quantity: 20 },         // 300,000
      { asset_id: 'mm', kind: 'market' as const, symbol: 'BTC-JPY', name: 'Bitcoin', quantity: 0.01 },  // 100,000
    ],
    quotes, fx,
  };

  it('按类型合计，总额 = 现金 + 其他资产', () => {
    const r = analyzeAssetStructure(base);
    expect(r.total).toBe(1_000_000 + 1_000_000 + 400_000 + 300_000);
    const t = Object.fromEntries(r.byType.map((s) => [s.key, s.value]));
    // pp 资产价值 1,000,000 ≥ 持仓合计 950,000 → 差额 50,000 记「未明细」
    expect(t).toEqual({ cash: 1_050_000, index: 600_000, stock: 600_000, crypto: 100_000, unknown: 350_000 });
    expect(r.invest).toBe(1_650_000);
  });

  it('前几大持仓：跨账户合并同一代码', () => {
    const r = analyzeAssetStructure(base);
    expect(r.top[0]).toMatchObject({ symbol: 'TSLA', value: 600_000 });
    expect(r.top[0]!.pctOfInvest).toBeCloseTo(36.4, 1);
  });

  it('按地区：美股基金 + 特斯拉都算美国', () => {
    const r = analyzeAssetStructure(base);
    const g = Object.fromEntries(r.byRegion.map((s) => [s.key, s.value]));
    expect(g.us).toBe(1_200_000);
    expect(g.crypto).toBe(100_000);
  });
});
