import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  computeIdleCashAdvice, holdingValueJpy, quoteKey, formatYen,
  DEFAULT_ALLOCATION_TARGETS, DEFAULT_EMERGENCY_MONTHS, type AllocationTarget, type Holding,
} from '@cfp/shared';
import { Card } from './Card';
import { Icon } from './Icon';
import { useStore } from '../lib/store';
import { apiPut } from '../lib/api';

/**
 * 闲置资金建议：现金超出「6 个月生活成本」的部分，按用户自己设定的目标配置比例分到各类别。
 * 只做比例算术（先补离目标最远的类别），不推荐具体标的。
 */

/** 按名称粗分类（仅在用户点「自动分类」时用于未分类的持仓；之后可逐个改） */
function guessBucket(h: Pick<Holding, 'symbol' | 'name' | 'kind'>, targets: AllocationTarget[]): string | null {
  const keys = new Set(targets.map((t) => t.key));
  const text = `${h.symbol} ${h.name}`.toUpperCase();
  if (keys.has('tsla') && /\bTSLA\b|テスラ|特斯拉|TESLA/.test(text)) return 'tsla';
  if (keys.has('us_index') && /S&P|SP500|NASDAQ|纳斯达克|标普|オール|ALL.?COUNTRY|全世界|インデックス|指数|INDEX|ETF|FANG/.test(text)) return 'us_index';
  if (h.kind === 'manual') return null; // 账户现金不算投资类别
  return keys.has('others') ? 'others' : null;
}

export function IdleCashAdviceCard({ cash, monthlyLivingCost }: { cash: number; monthlyLivingCost: number }) {
  const holdings = useStore((s) => s.holdings);
  const quotes = useStore((s) => s.quotes);
  const fx = useStore((s) => s.fx);
  const saved = useStore((s) => s.config?.allocation_targets);
  const loadHoldings = useStore((s) => s.loadHoldings);
  const saveTargets = useStore((s) => s.saveAllocationTargets);
  const targets = saved ?? DEFAULT_ALLOCATION_TARGETS;
  const [editing, setEditing] = useState(false);
  const [classifying, setClassifying] = useState(false);

  useEffect(() => { loadHoldings().catch(() => {}); }, [loadHoldings]);

  const { advice, unassignedCount } = useMemo(() => {
    const qm = new Map(quotes.map((q) => [quoteKey(q.kind, q.symbol), q]));
    const byBucket: Record<string, number> = {};
    let unassignedCount = 0;
    for (const h of holdings) {
      if (h.kind === 'manual' && !h.bucket) continue; // 证券账户里的现金不计入配置
      const v = holdingValueJpy(h, qm.get(quoteKey(h.kind, h.symbol)), fx);
      if (v == null) continue;
      const key = h.bucket && targets.some((t) => t.key === h.bucket) ? h.bucket : '';
      if (!key) unassignedCount++;
      byBucket[key] = (byBucket[key] ?? 0) + v;
    }
    return {
      advice: computeIdleCashAdvice({ cash, monthlyLivingCost, targets, currentByBucket: byBucket, emergencyMonths: DEFAULT_EMERGENCY_MONTHS }),
      unassignedCount,
    };
  }, [holdings, quotes, fx, targets, cash, monthlyLivingCost]);

  const autoClassify = async () => {
    setClassifying(true);
    try {
      const todo = holdings.filter((h) => !h.bucket).map((h) => ({ h, b: guessBucket(h, targets) })).filter((x) => x.b);
      for (const { h, b } of todo) await apiPut(`/holdings/${h.id}`, { bucket: b });
      await loadHoldings();
    } finally {
      setClassifying(false);
    }
  };

  if (monthlyLivingCost <= 0) return null;
  const hasHoldings = holdings.some((h) => h.kind !== 'manual');
  const investable = advice.idle > 0;
  const maxVal = Math.max(1, ...advice.lines.map((l) => Math.max(l.current + l.suggest, l.target)));

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Icon name="sparkle" size={16} className="text-[var(--c-accent-text)]" strokeWidth={1.75} />
          <span>闲置资金建议</span>
        </div>
      }
      action={
        <button onClick={() => setEditing((v) => !v)} className="btn-ghost flex items-center gap-1 text-[12px]">
          <Icon name="settings" size={13} />
          <span>{editing ? '收起' : '目标配置'}</span>
        </button>
      }
    >
      {/* 结论：能投多少 */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <div className="text-[11px] text-notion-text-muted">
            {investable ? `超出 ${DEFAULT_EMERGENCY_MONTHS} 个月应急金、可以拿去投资` : `距 ${DEFAULT_EMERGENCY_MONTHS} 个月应急金还差`}
          </div>
          <div className={`font-numeric font-semibold text-[26px] leading-tight text-notion-text`}>
            {formatYen(Math.abs(advice.idle))}
          </div>
        </div>
        <div className="text-right text-[11.5px] text-notion-text-muted leading-relaxed">
          净可用现金 <span className="font-numeric text-notion-text-secondary">{formatYen(Math.round(cash))}</span><br />
          − 应急金 {DEFAULT_EMERGENCY_MONTHS} × {formatYen(Math.round(monthlyLivingCost))} = <span className="font-numeric text-notion-text-secondary">{formatYen(advice.emergencyTarget)}</span>
        </div>
      </div>

      {/* 各类别：当前 → 目标，建议投入 */}
      {hasHoldings ? (
        <div className="mt-4 space-y-3">
          {advice.lines.map((l) => (
            <div key={l.key}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-notion-text-secondary truncate">{l.label}</span>
                <span className="flex-shrink-0">
                  {l.suggest > 0
                    ? <span className="font-numeric font-semibold text-[var(--c-accent-text)]">+{formatYen(l.suggest)}</span>
                    : <span className="text-[11px] text-notion-text-muted">{investable ? '已达目标，本次不投' : '—'}</span>}
                </span>
              </div>
              {/* 条：灰 = 当前市值，强调色 = 建议投入；竖线 = 投入后的目标位置 */}
              <div className="relative h-2 mt-1 rounded-[var(--radius-pill)] bg-[var(--c-bg-alt)]">
                <div className="absolute inset-y-0 left-0 flex rounded-[var(--radius-pill)] overflow-hidden" style={{ width: `${((l.current + l.suggest) / maxVal) * 100}%` }}>
                  <div className="h-full bg-[var(--c-invest)]" style={{ flex: l.current }} />
                  {l.suggest > 0 && <div className="h-full bg-[var(--c-accent)] ml-[2px]" style={{ flex: l.suggest }} />}
                </div>
                <div className="absolute -top-1 -bottom-1 w-[2px] rounded-full bg-[var(--c-text-secondary)] opacity-70" style={{ left: `calc(${(l.target / maxVal) * 100}% - 1px)` }} />
              </div>
              <div className="text-[10.5px] text-notion-text-muted mt-0.5 font-numeric">
                当前 {formatYen(l.current)}（{l.currentPct}%）· 目标 {l.targetPct}%
              </div>
            </div>
          ))}
          <div className="flex gap-3 text-[10.5px] text-notion-text-muted">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-[2px] bg-[var(--c-invest)]" />当前</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-[2px] bg-[var(--c-accent)]" />建议投入</span>
            <span className="inline-flex items-center gap-1"><span className="w-[2px] h-2.5 bg-[var(--c-text-secondary)]" />目标</span>
          </div>
          {unassignedCount > 0 && (
            <div className="text-[11.5px] text-notion-text-secondary bg-[var(--c-bg-alt)] rounded-[var(--radius-md)] px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>有 {unassignedCount} 个持仓（{formatYen(advice.unassigned)}）还没分类，不计入上面的比例。</span>
              <button onClick={autoClassify} disabled={classifying} className="font-semibold text-[var(--c-accent-text)]">
                {classifying ? '分类中…' : '按名称自动分类'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-notion-text-secondary">
          在<Link to="/assets" className="text-[var(--c-accent-text)]">资产页</Link>给证券账户添加持仓后，这里会按你的目标比例算出每类该投多少。
        </p>
      )}

      {editing && <TargetsEditor targets={targets} onSave={async (t) => { await saveTargets(t); setEditing(false); }} />}

      <p className="mt-3 text-[10.5px] text-notion-text-muted leading-relaxed">
        按你设定的目标比例计算：先补离目标最远的类别，只买不卖。不构成投资建议。
      </p>
    </Card>
  );
}

function TargetsEditor({ targets, onSave }: { targets: AllocationTarget[]; onSave: (t: AllocationTarget[]) => Promise<void> }) {
  const [rows, setRows] = useState(targets.map((t) => ({ ...t })));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sum = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);

  const save = async () => {
    if (rows.some((r) => !r.label.trim())) { setError('类别名称不能为空'); return; }
    if (Math.round(sum) !== 100) { setError(`各类别合计需为 100%（现在 ${sum}%）`); return; }
    setSaving(true);
    try { await onSave(rows.map((r) => ({ ...r, label: r.label.trim(), pct: Number(r.pct) }))); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="mt-4 pt-4 border-t border-[var(--c-border)] space-y-2">
      <div className="text-[12px] font-semibold text-notion-text-secondary">目标配置（投资部分的比例）</div>
      {rows.map((r, i) => (
        <div key={r.key} className="flex items-center gap-2">
          <input className="input flex-1" value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <div className="relative w-24">
            <input
              type="number" inputMode="decimal" className="input font-numeric pr-7" value={r.pct}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)))}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-notion-text-muted">%</span>
          </div>
          <button type="button" className="text-notion-text-muted px-1" aria-label="删除类别" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length <= 1}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn-ghost text-[12px] text-[var(--c-accent-text)]"
          onClick={() => setRows([...rows, { key: `b${Date.now().toString(36)}`, label: '新类别', pct: 0 }])}>
          <Icon name="add" size={12} /> 添加类别
        </button>
        <span className={`text-[11.5px] font-numeric ${Math.round(sum) === 100 ? 'text-notion-text-muted' : 'text-notion-warning'}`}>合计 {sum}%</span>
      </div>
      {error && <div className="text-[12px] text-notion-warning">{error}</div>}
      <div className="flex justify-end">
        <button type="button" className="btn-primary text-[12px]" onClick={save} disabled={saving}>{saving ? '保存中' : '保存目标'}</button>
      </div>
      <p className="text-[10.5px] text-notion-text-muted">在资产页的持仓里，给每个持仓选择属于哪个类别。</p>
    </div>
  );
}
