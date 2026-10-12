import { useState } from 'react';
import { computeFire, formatYen } from '@cfp/shared';
import { Card } from './Card';
import { Icon } from './Icon';
import { MoneyInput } from './MoneyInput';
import { loadFireSettings, saveFireSettings, DEFAULT_FIRE, type FireSettings, type LongTermStats } from '../lib/longTerm';

/**
 * 财务自由进度：
 *   目标 = 年支出 ÷ 安全提取率（4% 法则 → 年支出 × 25）
 *   当前 = 现金（扣除本期应付）+ 其他资产（股票基金/加密/房产等）
 *   预计 = 按近 N 期月均「收入 − 生活成本」持续投入 + 预期年化收益，逐月复利推演
 */
export function FireCard({ stats, cashAssets }: { stats: LongTermStats; cashAssets: number }) {
  const [settings, setSettings] = useState<FireSettings>(loadFireSettings);
  const [editing, setEditing] = useState(false);

  const { agg, otherAssetsTotal } = stats;
  const defaultAnnualSpend = agg.avgConsume * 12;
  const annualSpend = settings.annualSpendOverride ?? defaultAnnualSpend;
  const monthlyContribution = agg.avgIncome - agg.avgConsume;
  const currentAssets = cashAssets + otherAssetsTotal;

  const fire = computeFire({
    currentAssets,
    annualSpend,
    withdrawalRatePct: settings.withdrawalRatePct,
    annualReturnPct: settings.annualReturnPct,
    monthlyContribution,
  });

  const update = (patch: Partial<FireSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveFireSettings(next);
  };

  const period = agg.n > 1 ? `近 ${agg.n} 期` : '本期';
  const multiple = settings.withdrawalRatePct > 0 ? Math.round(100 / settings.withdrawalRatePct * 10) / 10 : 0;

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Icon name="trending-up" size={16} className="text-[var(--c-accent-text)]" strokeWidth={1.75} />
          <span>财务自由</span>
        </div>
      }
      action={
        <button onClick={() => setEditing((v) => !v)} className="btn-ghost flex items-center gap-1 text-[12px]">
          <Icon name="settings" size={13} />
          <span>{editing ? '收起' : '调整参数'}</span>
        </button>
      }
    >
      {fire.target <= 0 ? (
        <p className="text-[13px] text-notion-text-secondary leading-relaxed">
          还没有生活成本数据。录入信用卡、账单、订阅等消费后，这里会算出财务自由目标；也可以在「调整参数」里直接填年支出。
        </p>
      ) : (
        <>
          {/* 还差多少 */}
          <div className="flex items-end justify-between gap-3 mb-2">
            <div>
              <div className="text-[12px] text-notion-text-secondary mb-0.5">{fire.reached ? '已达成目标' : '距目标还差'}</div>
              <div className="font-numeric font-semibold text-[28px] leading-none tabular-nums text-notion-text">
                {fire.reached ? '🎉' : formatYen(fire.gap)}
              </div>
            </div>
            <div className="text-right">
              <div className="font-numeric font-semibold text-[20px] leading-none tabular-nums text-[var(--c-accent-text)]">
                {fire.progressPct}%
              </div>
              <div className="text-[11px] text-notion-text-muted mt-1">完成度</div>
            </div>
          </div>
          <div className="h-2 rounded-[var(--radius-pill)] bg-[var(--c-bg-alt)] overflow-hidden mb-4">
            <div
              className="h-full rounded-[var(--radius-pill)] bg-[var(--c-accent)] transition-[width] duration-[var(--dur-deliberate)] ease-[var(--ease-out-expo)]"
              style={{ width: `${fire.progressPct}%` }}
            />
          </div>

          {/* 拆解 */}
          <dl className="space-y-2 text-[13px]">
            <Row
              label="目标金额"
              value={formatYen(fire.target)}
              hint={`年支出 ${formatYen(annualSpend)} × ${multiple}（${settings.withdrawalRatePct}% 提取率）`}
            />
            <Row
              label="当前资产"
              value={formatYen(currentAssets)}
              hint={`现金 ${formatYen(cashAssets)}${otherAssetsTotal > 0 ? ` + 其他资产 ${formatYen(otherAssetsTotal)}` : ''}`}
            />
          </dl>

          {/* 预计达成时间 */}
          <div className="mt-4 pt-3 border-t border-[var(--c-border)] text-[12px] leading-relaxed text-notion-text-secondary">
            {fire.reached ? (
              <>按 {settings.withdrawalRatePct}% 提取率，资产已能覆盖年支出。</>
            ) : fire.monthsToGoal !== null ? (
              <>
                按{period}平均每月净储蓄 <b className="text-notion-text font-semibold">{formatYen(monthlyContribution)}</b>
                {`、年化 ${settings.annualReturnPct}%，预计 `}
                <b className="text-[var(--c-accent-text)] font-semibold">{formatDuration(fire.monthsToGoal)}</b>
                {` 后达成（约 ${targetYear(fire.monthsToGoal)} 年）。`}
              </>
            ) : (
              <>
                按{period}平均每月净储蓄 {formatYen(monthlyContribution)}，100 年内无法达成。提高储蓄或降低年支出后再看看。
              </>
            )}
          </div>
        </>
      )}

      {editing && (
        <div className="mt-4 pt-4 border-t border-[var(--c-border)] space-y-3">
          <div>
            <label className="label">财务自由后的年支出</label>
            <MoneyInput
              value={settings.annualSpendOverride ?? 0}
              onChange={(v) => update({ annualSpendOverride: v > 0 ? v : null })}
              ariaLabel="财务自由后的年支出"
            />
            <p className="text-xs text-notion-text-muted mt-1 leading-relaxed">
              填 0 = 按{period}月均生活成本 {formatYen(agg.avgConsume)} × 12（不含投资）
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PctField label="安全提取率" value={settings.withdrawalRatePct} onChange={(v) => update({ withdrawalRatePct: v })} hint="4% 法则 = 年支出 × 25" />
            <PctField label="预期年化收益" value={settings.annualReturnPct} onChange={(v) => update({ annualReturnPct: v })} hint="扣除通胀后的实际收益" />
          </div>
          <button onClick={() => update(DEFAULT_FIRE)} className="btn-ghost text-[12px]">恢复默认</button>
        </div>
      )}
    </Card>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-notion-text-secondary">{label}</dt>
        <dd className="text-[11px] text-notion-text-muted truncate">{hint}</dd>
      </div>
      <dd className="font-numeric font-semibold tabular-nums text-notion-text flex-shrink-0">{value}</dd>
    </div>
  );
}

function PctField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type="number" inputMode="decimal" step="0.1" min="0" max="100"
          className="input font-numeric pr-8"
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          onFocus={(e) => e.currentTarget.select()}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-notion-text-muted">%</span>
      </div>
      <p className="text-xs text-notion-text-muted mt-1">{hint}</p>
    </div>
  );
}

function formatDuration(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} 个月`;
  return m === 0 ? `${y} 年` : `${y} 年 ${m} 个月`;
}

function targetYear(months: number): number {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.getFullYear();
}
