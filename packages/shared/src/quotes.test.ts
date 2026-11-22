import { describe, it, expect } from 'vitest';
import { parseYahooChart, parseYahooJpFundPage, parseEastmoneyNav, holdingValueJpy, valueHoldings, quoteKey, fxSymbol, holdingReturn, sumReturns } from './quotes';
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

describe('holdingReturn / sumReturns', () => {
  const fx = { USD: 150 };
  const usd = { price: 345.82, currency: 'USD' };
  const jpy = { price: 42207, currency: 'JPY' };

  it('日元成本：含汇率损益', () => {
    // 0.1 股 × 345.82 USD × 150 = 5187.3 円；成本 4,000 円
    const r = holdingReturn({ kind: 'market', quantity: 0.1, cost_basis: 4000, cost_currency: null }, usd, fx)!;
    expect(r.value).toBeCloseTo(5187.3, 1);
    expect(r.gain).toBeCloseTo(1187.3, 1);
    expect(r.pct).toBeCloseTo(29.68, 1);
  });

  it('外币成本：收益率按外币算，金额按现汇折日元', () => {
    // moomoo：4 股，均价 169.54 → 成本 678.16 USD
    const r = holdingReturn({ kind: 'market', quantity: 4, cost_basis: 678.16, cost_currency: 'USD' }, usd, fx)!;
    expect(r.pct).toBeCloseTo(((1383.28 - 678.16) / 678.16) * 100, 4);
    expect(r.gain).toBeCloseTo((1383.28 - 678.16) * 150, 4);
    expect(r.cost).toBeCloseTo(678.16 * 150, 4);
  });

  it('日本投信按每 1 万口计价', () => {
    const r = holdingReturn({ kind: 'jp_fund', quantity: 236164, cost_basis: 800000, cost_currency: 'JPY' }, jpy, fx)!;
    expect(r.value).toBeCloseTo(236164 / 10000 * 42207, 4);
  });

  it('没填成本 / manual / 币种不匹配 → null', () => {
    expect(holdingReturn({ kind: 'market', quantity: 1, cost_basis: null }, usd, fx)).toBeNull();
    expect(holdingReturn({ kind: 'manual', quantity: 1000, cost_basis: 1000 }, undefined, fx)).toBeNull();
    expect(holdingReturn({ kind: 'market', quantity: 1, cost_basis: 100, cost_currency: 'EUR' }, usd, fx)).toBeNull();
  });

  it('合计只统计填了成本的持仓', () => {
    const quotes = new Map([['market:TSLA', usd], ['jp_fund:03311187', jpy]]);
    const s = sumReturns([
      { kind: 'market', symbol: 'TSLA', quantity: 0.1, cost_basis: 4000 },
      { kind: 'jp_fund', symbol: '03311187', quantity: 10000, cost_basis: null },
      { kind: 'manual', symbol: '', quantity: 5000, cost_basis: null },
    ], quotes, fx);
    expect(s.count).toBe(1);
    expect(s.missing).toBe(1);
    expect(s.cost).toBe(4000);
    expect(s.pct).toBeCloseTo(29.68, 1);
    expect(s.total).toBeCloseTo(5187.3 + 42207, 1);
  });
});
