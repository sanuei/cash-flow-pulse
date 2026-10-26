import { describe, it, expect } from 'vitest';
import { computeDashboardV2, computeDailyCashflow } from './calc';

// 发薪日 10 号；现金余额 10/12 最后更新；10/26 到账一笔临时收入 ¥432,000
const config = { user_id: 'u', pay_day: 10, snapshot_offsets: [0], weekend_shift: false, created_at: 0, updated_at: 0 };
const cash = (updated: Date) => [{
  id: 'c', user_id: 'u', name: 'bank', balance: 595227, locked_amount: 0, sort_order: 0, created_at: 0, updated_at: updated.getTime(),
}];
const salary = { id: 's', user_id: 'u', name: '工资', amount: 305000, frequency: 'monthly', pay_day: 10, day_of_week: null, start_date: '2024-01-01', end_date: null } as any;
const web = { id: 'w', user_id: 'u', name: '网站开发第一期', amount: 432000, frequency: 'single', pay_day: null, day_of_week: null, start_date: '2026-10-26', end_date: '2026-10-26' } as any;
const run = (today: Date, updated: Date) =>
  computeDashboardV2(today, config, cash(updated), [], [], [], [], [salary, web], [], []);

describe('已到账、未记入余额的收入', () => {
  it('余额 10/12 更新、收入 10/26 到账 → 计入净可用；10/10 的工资早于更新日，视为已在余额里', () => {
    const r = run(new Date(2026, 9, 26, 12), new Date(2026, 9, 12, 21, 58));
    expect(r.pending_income).toBe(432000);
    expect(r.pending_income_items.map((i) => i.name)).toEqual(['网站开发第一期']);
    expect(r.net_available).toBe(595227 + 432000);
    expect(r.balance_as_of).toBe('2026-10-12');
  });

  it('到账后更新过余额 → 不再重复计入', () => {
    const r = run(new Date(2026, 9, 27, 12), new Date(2026, 9, 26, 20));
    expect(r.pending_income).toBe(0);
    expect(r.net_available).toBe(595227);
  });

  it('到账日在今天之后 → 不计入（钱没到不当可用）', () => {
    const r = run(new Date(2026, 9, 20, 12), new Date(2026, 9, 12));
    expect(r.pending_income).toBe(0);
  });

  it('逐日现金流今天的锚点与净可用同口径', () => {
    const today = new Date(2026, 9, 26, 12);
    const cf = computeDailyCashflow(today, config, cash(new Date(2026, 9, 12, 21, 58)), [], [], [], [salary, web]);
    expect(cf.anchor).toBe(595227 + 432000);
  });
});
