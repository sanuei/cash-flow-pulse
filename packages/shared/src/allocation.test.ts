import { describe, it, expect } from 'vitest';
import { computeIdleCashAdvice, DEFAULT_ALLOCATION_TARGETS } from './allocation';

const targets = DEFAULT_ALLOCATION_TARGETS; // 50 / 30 / 20

describe('闲置资金分配', () => {
  it('现金低于 6 个月应急金线 → 不建议投入，idle 为负数（还差多少）', () => {
    const r = computeIdleCashAdvice({ cash: 900_000, monthlyLivingCost: 180_000, targets, currentByBucket: {} });
    expect(r.emergencyTarget).toBe(1_080_000);
    expect(r.idle).toBe(-180_000);
    expect(r.lines.every((l) => l.suggest === 0)).toBe(true);
  });

  it('先补缺口：特斯拉已超配时不再投；离目标最远的类别分得最多', () => {
    // 应急金线 6 × 181,267 = 1,087,602；现金 1,251,541 → 闲置 163,939
    const r = computeIdleCashAdvice({
      cash: 1_251_541, monthlyLivingCost: 181_267, targets,
      currentByBucket: { us_index: 1_500_000, tsla: 1_360_000, others: 300_000 },
    });
    expect(r.idle).toBe(163_939);
    const by = Object.fromEntries(r.lines.map((l) => [l.key, l]));
    expect(by.tsla!.suggest).toBe(0);                       // 已超过 30%
    // 投入后总额 3,323,939：指数目标 1,661,970（缺 161,970）、其他目标 664,788（缺 364,788）
    expect(by.others!.suggest).toBeGreaterThan(by.us_index!.suggest);
    expect(by.us_index!.suggest).toBeGreaterThan(0);
    expect(r.lines.reduce((s, l) => s + l.suggest, 0)).toBe(164_000); // 合计 = 闲置资金（取整到千）
  });

  it('缺口全部补齐后，剩余按目标比例分', () => {
    const r = computeIdleCashAdvice({
      cash: 2_000_000, monthlyLivingCost: 0, targets,
      currentByBucket: { us_index: 500_000, tsla: 300_000, others: 200_000 }, // 正好 50/30/20
    });
    expect(r.lines.map((l) => l.suggest)).toEqual([1_000_000, 600_000, 400_000]);
  });

  it('未分类的持仓单独统计，不参与比例', () => {
    const r = computeIdleCashAdvice({ cash: 0, monthlyLivingCost: 0, targets, currentByBucket: { '': 50_000, gold: 10_000, tsla: 1 } });
    expect(r.unassigned).toBe(60_000);
  });
});
