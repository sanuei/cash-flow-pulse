import { formatYen } from '@cfp/shared';
import type { CycleStat } from '@cfp/shared';

/**
 * 首页 Hero 的两张小图：
 *   RunwayGauge     —— 现金可支撑月数 vs 应急金基准线（3 个月达标 / 6 个月充足）
 *   LivingCostBars  —— 近 N 期每期生活成本（强调当前期，其余灰；虚线 = 平均）
 */

const LEVELS = [
  { at: 3, label: '3 个月 · 达标' },
  { at: 6, label: '6 个月 · 充足' },
];

export function runwayStatus(months: number | null): { text: string; color: string } | null {
  if (months === null) return null;
  if (months >= 6) return { text: '应急金充足', color: 'var(--c-success)' };
  if (months >= 3) return { text: '应急金达标', color: 'var(--c-success)' };
  return { text: '应急金不足 3 个月', color: 'var(--c-warning)' };
}

export function RunwayGauge({ months, monthlyCost, cash }: { months: number | null; monthlyCost: number; cash: number }) {
  // 刻度上限：至少 12 个月，超过时向上取整到 6 的倍数，让填充永远在轨道内
  const max = Math.max(12, Math.ceil(((months ?? 0) + 0.5) / 6) * 6);
  const pct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  const fill = months === null ? 0 : pct(months);
  const status = runwayStatus(months);

  // 下一个基准线还差多少钱
  const next = months === null ? null : LEVELS.find((l) => months < l.at);
  const gapToNext = next && monthlyCost > 0 ? Math.max(0, next.at * monthlyCost - cash) : 0;

  return (
    <div>
      <div className="relative h-2.5 rounded-[var(--radius-pill)] bg-[var(--c-bg-alt)]">
        <div
          className="absolute inset-y-0 left-0 rounded-[var(--radius-pill)] transition-[width] duration-[var(--dur-deliberate)] ease-[var(--ease-out-expo)]"
          style={{ width: `${fill}%`, background: 'linear-gradient(90deg, var(--c-accent) 0%, var(--c-accent-hover) 100%)' }}
        />
        {LEVELS.map((l) => (
          <div
            key={l.at}
            className="absolute -top-1 -bottom-1 w-[2px] rounded-full bg-[var(--c-text-secondary)] opacity-70"
            style={{ left: `calc(${pct(l.at)}% - 1px)` }}
            aria-hidden="true"
          />
        ))}
      </div>
      {/* 基准线标签：对齐到刻度位置 */}
      <div className="relative h-4 mt-1.5 text-[10.5px] text-notion-text-muted">
        <span className="absolute left-0">0</span>
        {LEVELS.map((l) => (
          <span key={l.at} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct(l.at)}%` }}>
            {l.label}
          </span>
        ))}
        <span className="absolute right-0">{max}</span>
      </div>
      {status && (
        <div className="mt-2 flex items-center gap-1.5 text-[12px]">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: status.color }} aria-hidden="true" />
          <span className="font-semibold" style={{ color: status.color }}>{status.text}</span>
          {next && gapToNext > 0 && (
            <span className="text-notion-text-muted">· 距 {next.at} 个月还差 {formatYen(gapToNext)}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function LivingCostBars({ cycles, highlight }: { cycles: CycleStat[]; highlight?: string }) {
  if (cycles.length === 0) return null;
  const values = cycles.map((c) => c.consume);
  const max = Math.max(1, ...values);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const focusId = highlight && cycles.some((c) => c.cycle_id === highlight) ? highlight : cycles[cycles.length - 1]!.cycle_id;
  const focus = cycles.find((c) => c.cycle_id === focusId)!;
  const diff = avg > 0 ? Math.round(((focus.consume - avg) / avg) * 100) : 0;
  const H = 96; // 柱区高度 px

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-[12px] font-semibold text-notion-text-secondary">每期生活成本</span>
        <span className="text-[11px] text-notion-text-muted">
          {focus.cycle_id} <span className="font-numeric text-notion-text">{formatYen(focus.consume)}</span>
          {cycles.length > 1 && (
            <span style={{ color: diff > 0 ? 'var(--c-warning)' : 'var(--c-success)' }}>
              {' '}{diff > 0 ? '↑' : diff < 0 ? '↓' : ''}{Math.abs(diff)}% vs 均值
            </span>
          )}
        </span>
      </div>

      <div className="relative" style={{ height: H }}>
        {/* 平均线 */}
        {cycles.length > 1 && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-[var(--c-text-muted)] opacity-60"
            style={{ bottom: (avg / max) * H }}
            aria-hidden="true"
          >
            <span className="absolute right-0 -top-4 text-[10px] text-notion-text-muted font-numeric">
              均 {formatYen(Math.round(avg))}
            </span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-2" role="img"
          aria-label={cycles.map((c) => `${c.cycle_id} ${formatYen(c.consume)}`).join('，')}>
          {cycles.map((c) => {
            const isFocus = c.cycle_id === focusId;
            return (
              <div key={c.cycle_id} className="flex-1 h-full flex items-end group" title={`${c.cycle_id} 生活成本 ${formatYen(c.consume)}`}>
                <div
                  className="w-full rounded-t-[4px] transition-[height,opacity] duration-[var(--dur-medium)] ease-[var(--ease-out-expo)] group-hover:opacity-100"
                  style={{
                    height: `${Math.max(2, (c.consume / max) * 100)}%`,
                    background: isFocus ? 'var(--c-accent)' : 'var(--c-text-muted)',
                    opacity: isFocus ? 1 : 0.35,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-1.5 sm:gap-2 mt-1.5">
        {cycles.map((c) => (
          <span
            key={c.cycle_id}
            className={`flex-1 text-center text-[10.5px] font-numeric ${c.cycle_id === focusId ? 'text-[var(--c-accent-text)] font-semibold' : 'text-notion-text-muted'}`}
          >
            {Number(c.cycle_id.slice(5))}月
          </span>
        ))}
      </div>
    </div>
  );
}
