import { describe, it, expect } from 'vitest';
import { parseYahooChart, parseYahooJpFundPage, parseEastmoneyNav, holdingValueJpy, valueHoldings, quoteKey, fxSymbol } from './quotes';
import { yahooChartTsla, eastmoneyLsjz018043, yahooJpFund03311187 } from './__fixtures__/quotes';

describe('行情解析（真实响应样本）', () => {
  it('Yahoo chart：价格、币种、名称、日期', () => {
    const q = parseYahooChart(yahooChartTsla);
    expect(q.price).toBe(345.82);
    expect(q.currency).toBe('USD');
    expect(q.name).toBe('Tesla, Inc.');
    expect(q.priceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('Yahoo chart：代码不存在 → 报错', () => {
    expect(() => parseYahooChart({ chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } }))
      .toThrow('No data found');
  });

  it('Yahoo chart：伦敦辅币 GBp 换算成 GBP', () => {
    const q = parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 2500, currency: 'GBp' } }], error: null } });
    expect(q).toMatchObject({ price: 25, currency: 'GBP' });
  });

  it('Yahoo!ファイナンス 投信页：基準価額、名称、净值日', () => {
    const q = parseYahooJpFundPage(yahooJpFund03311187, '03311187', new Date(2026, 10, 22));
    expect(q.price).toBe(42207);
    expect(q.currency).toBe('JPY');
    expect(q.name).toBe('eMAXIS Slim米国株式(S&P500)');
    expect(q.priceDate).toBe('2026-11-20');
  });

  it('Yahoo!ファイナンス 投信页：代码与页面不一致 → 报错（防止拿到推荐列表里别的基金）', () => {
    expect(() => parseYahooJpFundPage(yahooJpFund03311187, '0331418A')).toThrow();
  });

  it('Yahoo!ファイナンス 投信页：1 月初看到 12/30 → 去年', () => {
    const html = '"priceBoard":{"code":"X1","name":"F","price":{"value":"10,000","updateDate":"12/30"}}';
    expect(parseYahooJpFundPage(html, 'X1', new Date(2027, 0, 3)).priceDate).toBe('2026-12-30');
  });

  it('东方财富净值', () => {
    const q = parseEastmoneyNav(eastmoneyLsjz018043);
    expect(q.price).toBe(1.8214);
    expect(q.currency).toBe('CNY');
    expect(q.priceDate).toBe('2026-11-19');
  });
});

describe('折算日元', () => {
  const rates = { USD: 155, CNY: 21.7 };

  it('日本投信：口数 ÷ 1 万 × 基準価額（与 PayPay証券 显示一致）', () => {
    // 截图：eMAXIS Slim S&P500 236,164口、基準価額 42,207 → 996,775円
    expect(Math.round(holdingValueJpy({ kind: 'jp_fund', quantity: 236164 }, { price: 42207, currency: 'JPY' }, rates)!)).toBe(996777);
  });

  it('美股按汇率折算；中国基金按人民币汇率', () => {
    expect(holdingValueJpy({ kind: 'market', quantity: 4 }, { price: 345.82, currency: 'USD' }, rates)).toBeCloseTo(4 * 345.82 * 155);
    expect(holdingValueJpy({ kind: 'cn_fund', quantity: 1000 }, { price: 1.8214, currency: 'CNY' }, rates)).toBeCloseTo(1821.4 * 21.7);
  });

  it('缺汇率或缺行情 → null；手动金额原样', () => {
    expect(holdingValueJpy({ kind: 'market', quantity: 1 }, { price: 10, currency: 'EUR' }, rates)).toBeNull();
    expect(holdingValueJpy({ kind: 'market', quantity: 1 }, undefined, rates)).toBeNull();
    expect(holdingValueJpy({ kind: 'manual', quantity: 14675 }, undefined, rates)).toBe(14675);
  });

  it('valueHoldings：合计与完整性', () => {
    const quotes = new Map([[quoteKey('market', '8306.T'), { price: 2500, currency: 'JPY' }]]);
    expect(valueHoldings([
      { kind: 'market', symbol: '8306.T', quantity: 10 },
      { kind: 'manual', symbol: '', quantity: 14675 },
    ], quotes, rates)).toEqual({ total: 39675, complete: true });
    expect(valueHoldings([{ kind: 'market', symbol: 'NOPE', quantity: 1 }], quotes, rates).complete).toBe(false);
  });

  it('fxSymbol', () => {
    expect(fxSymbol('usd')).toBe('USDJPY=X');
    expect(fxSymbol('JPY')).toBeNull();
  });
});
