import { useMemo } from 'react';
import { buildSimBaseline, simInputFor, ageFromBirthYear, type SimBaseline } from '@cfp/shared';
import { useStore } from './store';
import { useLongTermStats } from './longTerm';

/**
 * 财富模拟器的「基准」= 你现在的路线，全部来自真实数据（构建逻辑在 shared/simulator.ts 的
 * buildSimBaseline，与后端 AI 诊断共用）：
 *   - 现金 = 可用现金 + 锁定金额（已扣本期待还的信用卡）
 *   - 投资资产 = 其他资产里的股票基金 / 加密 / 其他（房产默认不计入）
 *   - 月收入 / 月生活成本 / 每月定投 = 近 N 期平均（与首页同一口径）
 *   - 提取率 / 收益率 / 退休后支出 = 首页「财务自由」卡的参数
 */
export type { SimBaseline };
export const currentAge = ageFromBirthYear;
export const withSettings = simInputFor;

export function useSimBaseline(): SimBaseline | null {
  const stats = useLongTermStats();
  const config = useStore((s) => s.config);
  const calc = useStore((s) => s.calc);
  const otherAssets = useStore((s) => s.otherAssets);

  return useMemo(() => {
    if (!stats || !config || !calc) return null;
    return buildSimBaseline({
      agg: stats.agg,
      cash: calc.net_available + calc.total_locked,
      otherAssets,
      fire: config.fire_settings ?? null,
      birthYear: config.birth_year ?? null,
    });
  }, [stats, config, calc, otherAssets]);
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
