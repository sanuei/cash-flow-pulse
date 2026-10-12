import { useMemo } from 'react';
import { useStore } from './store';
import { earliestDataDate, computeCycleHistory, aggregateCycles } from '@cfp/shared';
import type { CycleAgg, CycleStat, FireSettings } from '@cfp/shared';

export type LongTermStats = {
  cycles: CycleStat[];
  agg: CycleAgg;          // 近 N 期汇总（avgConsume = 月均生活成本，不含投资）
  otherAssetsTotal: number;
};

/**
 * 近 6 个发薪周期的收支（前端用 store 里的规则直接重算，与 AI 诊断同一口径），
 * 供「现金可支撑月数」和「财务自由」使用。
 */
export function useLongTermStats(): LongTermStats | null {
  const config = useStore((s) => s.config);
  const creditCards = useStore((s) => s.creditCards);
  const investments = useStore((s) => s.investments);
  const bills = useStore((s) => s.bills);
  const incomes = useStore((s) => s.incomes);
  const subscriptions = useStore((s) => s.subscriptions);
  const oneOffs = useStore((s) => s.oneOffs);
  const snapshots = useStore((s) => s.snapshots);
  const otherAssets = useStore((s) => s.otherAssets);
  const generatedAt = useStore((s) => s.generatedAt);

  return useMemo(() => {
    if (!config) return null;
    const firstSnapshot = snapshots.reduce<string | null>(
      (min, s) => (min === null || s.snapshot_date < min ? s.snapshot_date : min),
      null,
    );
    const dataStart = earliestDataDate(config.created_at, firstSnapshot, creditCards, oneOffs);
    const cycles = computeCycleHistory({
      today: new Date(),
      config,
      cards: creditCards,
      investments, bills, incomes, subscriptions, oneOffs,
      dataStart,
    });
    return {
      cycles,
      agg: aggregateCycles(cycles),
      otherAssetsTotal: otherAssets.reduce((s, a) => s + (a.value ?? 0), 0),
    };
    // generatedAt：数据刷新后重算（「今天」可能跨期）
  }, [config, creditCards, investments, bills, incomes, subscriptions, oneOffs, snapshots, otherAssets, generatedAt]);
}

// ── 财务自由参数：存服务器 user_config.fire_settings（跨设备同步）──
export type { FireSettings };
export const DEFAULT_FIRE: FireSettings = { withdrawalRatePct: 4, annualReturnPct: 5, annualSpendOverride: null };

// 旧版本存在浏览器 localStorage 里；读出来上传一次后删除
const LEGACY_FIRE_KEY = 'cfp.fire.v1';

export function takeLegacyFireSettings(): FireSettings | null {
  try {
    const raw = localStorage.getItem(LEGACY_FIRE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    return {
      withdrawalRatePct: num(p.withdrawalRatePct, DEFAULT_FIRE.withdrawalRatePct),
      annualReturnPct: num(p.annualReturnPct, DEFAULT_FIRE.annualReturnPct),
      annualSpendOverride: typeof p.annualSpendOverride === 'number' && p.annualSpendOverride > 0 ? p.annualSpendOverride : null,
    };
  } catch {
    return null;
  }
}

export function clearLegacyFireSettings() {
  try { localStorage.removeItem(LEGACY_FIRE_KEY); } catch { /* noop */ }
}
