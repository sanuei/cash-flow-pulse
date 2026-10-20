import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { simulate, formatYen } from '@cfp/shared';
import { Card } from './Card';
import { Icon } from './Icon';
import { MoneyInput } from './MoneyInput';
import { DEFAULT_FIRE, takeLegacyFireSettings, clearLegacyFireSettings, type FireSettings, type LongTermStats } from '../lib/longTerm';
import { useStore } from '../lib/store';
import { useSimBaseline, formatMonths, yearAfterMonths } from '../lib/simulator';

/**
 * 财务自由进度（与「财富模拟」页同一引擎 simulate()，用的就是模拟器里的「你现在的路线」）：
 *   目标 = 年支出 ÷ 安全提取率（4% 法则 → 年支出 × 25）
 *   当前 = 现金（扣除本期应付）+ 投资资产（股票基金/加密/其他；房产不计入——自住房不能按 4% 取出来花）
 *   预计 = 每月定投按预期年化收益复利，其余结余留作现金（按通胀缩水），逐月推演
 */
export function FireCard({ stats }: { stats: LongTermStats }) {
  const baseline = useSimBaseline();
  // 参数存在服务器（user_config.fire_settings），换设备也一致
  const serverSettings = useStore((s) => s.config?.fire_settings ?? null);
  const saveToServer = useStore((s) => s.saveFireSettings);
  const [settings, setSettings] = useState<FireSettings>(() => serverSettings ?? takeLegacyFireSettings() ?? DEFAULT_FIRE);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 旧版本存在本机浏览器里的参数：服务器上还没有时上传一次，然后清掉本机副本
  useEffect(() => {
    const legacy = takeLegacyFireSettings();
    if (!legacy) return;
    if (serverSettings) { clearLegacyFireSettings(); return; }
    saveToServer(legacy).then(clearLegacyFireSettings).catch(() => { /* 下次再试 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 服务器值变化（其他设备改过后刷新）→ 同步到本地编辑状态
  useEffect(() => {
    if (serverSettings) setSettings(serverSettings);
  }, [serverSettings]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const { agg } = stats;
  const defaultAnnualSpend = agg.avgConsume * 12;
  const annualSpend = settings.annualSpendOverride ?? defaultAnnualSpend;
  const cashAssets = baseline?.input.cash ?? 0;
  const investedAssets = baseline?.input.invested ?? 0;
  const currentAssets = cashAssets + investedAssets;
  const monthlyInvest = baseline?.input.monthlyInvest ?? 0;
  const surplusToCash = agg.avgIncome - agg.avgConsume - monthlyInvest;
  const birthYear = baseline?.birthYear ?? null;

  // 用编辑中的参数（还没存到服务器也立即生效）；没填出生年份时不设工作年龄上限
  const sim = baseline
    ? simulate({
        ...baseline.input,
        withdrawalRatePct: settings.withdrawalRatePct,
        annualReturnPct: settings.annualReturnPct,
        retireSpendMonthly: annualSpend / 12,
        ...(birthYear ? {} : { latestWorkAge: 999, lifeExpectancy: baseline.input.startAge + 100 }),
      })
    : null;
  const target = sim?.target ?? 0;
  const reached = sim?.fireMonth === 0;
  const fire = {
    target,
    reached,
    gap: Math.round(target - currentAssets),
    progressPct: target > 0 ? Math.min(100, Math.max(0, Math.round((currentAssets / target) * 1000) / 10)) : 0,
    monthsToGoal: sim?.fireMonth ?? null,
  };

  // 输入框每次按键都会触发，停顿 600ms 后再存服务器
  const update = (patch: Partial<FireSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveToServer(next).then(() => setSaveError(false)).catch(() => setSaveError(true));
    }, 600);
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
              hint={`现金 ${formatYen(cashAssets)}${investedAssets > 0 ? ` + 投资资产 ${formatYen(investedAssets)}` : ''}（房产不计入）`}
            />
          </dl>

          {/* 预计达成时间 */}
          <div className="mt-4 pt-3 border-t border-[var(--c-border)] text-[12px] leading-relaxed text-notion-text-secondary">
            {fire.reached ? (
              <>按 {settings.withdrawalRatePct}% 提取率，资产已能覆盖年支出。</>
            ) : fire.monthsToGoal !== null ? (
              <>
                按{period}平均每月定投 <b className="text-notion-text font-semibold">{formatYen(monthlyInvest)}</b>
                {`（年化 ${settings.annualReturnPct}%）`}
                {surplusToCash > 0 && <>、其余结余 {formatYen(surplusToCash)} 存为现金</>}
                {'，预计 '}
                <b className="text-[var(--c-accent-text)] font-semibold">{formatMonths(fire.monthsToGoal)}</b>
                {` 后达成（约 ${yearAfterMonths(fire.monthsToGoal)} 年${sim?.fireAge != null && birthYear ? ` · ${Math.floor(sim.fireAge)} 岁` : ''}）。`}
              </>
            ) : (
              <>
                按{period}平均每月定投 {formatYen(monthlyInvest)}，
                {birthYear ? `到 ${baseline?.input.latestWorkAge ?? 65} 岁仍达不到` : '100 年内无法达成'}。提高定投或降低年支出后再看看。
              </>
            )}
            <Link to="/simulator" className="mt-2 flex w-fit items-center gap-0.5 font-semibold text-[var(--c-accent-text)] hover:underline">
              详细模拟
              <Icon name="chevron-right" size={13} />
            </Link>
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
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => update(DEFAULT_FIRE)} className="btn-ghost text-[12px]">恢复默认</button>
            <span className={`text-[11px] ${saveError ? 'text-notion-warning' : 'text-notion-text-muted'}`}>
              {saveError ? '保存失败，请稍后重试' : '参数自动保存到账户'}
            </span>
          </div>
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
