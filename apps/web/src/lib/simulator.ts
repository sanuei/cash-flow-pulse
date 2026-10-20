import { useMemo } from 'react';
import { SIM_DEFAULTS, applySimSettings, type SimInput, type SimulatorSettings } from '@cfp/shared';
import { useStore } from './store';
import { useLongTermStats, DEFAULT_FIRE } from './longTerm';

/**
 * 财富模拟器的「基准」= 你现在的路线，全部来自真实数据：
 *   - 现金 = 可用现金 + 锁定金额（已扣本期待还的信用卡）
 *   - 投资资产 = 其他资产里的股票基金 / 加密 / 其他（房产默认不计入，自住房不能按 4% 取出来花）
 *   - 月收入 / 月生活成本 / 每月定投 = 近 N 期平均（与首页同一口径）
 *   - 提取率 / 收益率 / 退休后支出 = 首页「财务自由」卡的参数
 * 用户在模拟器里改过的参数（simulator_settings）再叠在上面。
 */
export type SimBaseline = {
  /** 出生年份；null = 还没填 */
  birthYear: number | null;
  /** 基准参数（未叠加用户覆盖） */
  input: SimInput;
  /** 房产市值（只有勾选「计入房产」时才加进投资资产） */
  realEstate: number;
  /** 统计了几期（用于文案「近 N 期」） */
  periods: number;
};

export function currentAge(birthYear: number, today = new Date()): number {
  return Math.max(0, today.getFullYear() - birthYear);
}

export function useSimBaseline(): SimBaseline | null {
  const stats = useLongTermStats();
  const config = useStore((s) => s.config);
  const calc = useStore((s) => s.calc);
  const otherAssets = useStore((s) => s.otherAssets);

  return useMemo(() => {
    if (!stats || !config || !calc) return null;
    const fire = config.fire_settings ?? DEFAULT_FIRE;
    const { agg } = stats;
    let invested = 0;
    let realEstate = 0;
    for (const a of otherAssets) {
      if (a.category === 'real_estate') realEstate += a.value ?? 0;
      else invested += a.value ?? 0;
    }
    const birthYear = config.birth_year ?? null;
    const input: SimInput = {
      ...SIM_DEFAULTS,
      startAge: birthYear ? currentAge(birthYear) : 30,
      cash: calc.net_available + calc.total_locked,
      invested,
      monthlyIncome: Math.round(agg.avgIncome),
      monthlyLivingCost: Math.round(agg.avgConsume),
      monthlyInvest: Math.round(agg.avgInvest),
      retireSpendMonthly: Math.round(fire.annualSpendOverride ? fire.annualSpendOverride / 12 : agg.avgConsume),
      withdrawalRatePct: fire.withdrawalRatePct,
      annualReturnPct: fire.annualReturnPct,
      events: [],
    };
    return { birthYear, input, realEstate, periods: agg.n };
  }, [stats, config, calc, otherAssets]);
}

/** 基准 + 用户覆盖 → 实际模拟用的参数（含「计入房产」） */
export function withSettings(b: SimBaseline, s: SimulatorSettings): SimInput {
  const out = applySimSettings(b.input, s);
  if (s.includeRealEstate) out.invested += b.realEstate;
  return out;
}

// ── 格式化 ─────────────────────────────────────────────

/** ¥1.25亿 / ¥3,450万 / ¥8,000 */
export function yenCompact(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1e8) return `${sign}¥${trim((a / 1e8).toFixed(2))}亿`;
  if (a >= 1e4) return `${sign}¥${Math.round(a / 1e4).toLocaleString('ja-JP')}万`;
  return `${sign}¥${Math.round(a).toLocaleString('ja-JP')}`;
}

function trim(s: string): string {
  return s.replace(/\.?0+$/, '');
}

export function formatMonths(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} 个月`;
  return m === 0 ? `${y} 年` : `${y} 年 ${m} 个月`;
}

/** 从今天起第 n 个月所在的年份 */
export function yearAfterMonths(n: number, today = new Date()): number {
  const d = new Date(today);
  d.setMonth(d.getMonth() + n);
  return d.getFullYear();
}
