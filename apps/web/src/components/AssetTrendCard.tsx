import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { formatYen } from '@cfp/shared';
import { Card } from './Card';
import { Icon } from './Icon';
import { apiGet } from '../lib/api';
import { yenAxisTick } from '../lib/chartFormat';
import { useStore } from '../lib/store';

/**
 * 首页「资产走势」：总资产 = 现金（账户余额）+ 投资（股票/基金/加密）+ 其他（房产等）。
 * 数据来自每小时 cron 记录的 asset_history；开始记录之前的日子只有快照里的现金余额（投资为空）。
 */

type Point = { date: string; cash: number; invest: number | null; other: number | null };
type HistoryResponse = { points: Point[]; recorded_since: string | null };

const RANGES = [
  { key: '1m', label: '1个月', days: 31 },
  { key: '3m', label: '3个月', days: 92 },
  { key: '6m', label: '6个月', days: 183 },
  { key: '1y', label: '1年', days: 366 },
  { key: 'all', label: '全部', days: 3650 },
] as const;
type RangeKey = typeof RANGES[number]['key'];

const SERIES = [
  { key: 'cash', label: '现金', color: 'var(--c-text-muted)', opacity: 0.35 },
  { key: 'invest', label: '投资', color: 'var(--c-invest)', opacity: 0.55 },
  { key: 'other', label: '其他', color: 'var(--c-warning)', opacity: 0.4 },
] as const;

export function AssetTrendCard() {
  const generatedAt = useStore((s) => s.generatedAt);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [range, setRange] = useState<RangeKey>(() => {
    try { return (localStorage.getItem('cfp.assetTrend.range') as RangeKey) || '3m'; } catch { return '3m'; }
  });

  useEffect(() => {
    let cancelled = false;
    apiGet<HistoryResponse>('/holdings/history?days=3650')
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ points: [], recorded_since: null }); });
    return () => { cancelled = true; };
  }, [generatedAt]);

  const pick = (k: RangeKey) => {
    setRange(k);
    try { localStorage.setItem('cfp.assetTrend.range', k); } catch { /* noop */ }
  };

  const view = useMemo(() => {
    if (!data) return null;
    const days = RANGES.find((r) => r.key === range)!.days;
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const pts = data.points.filter((p) => p.date >= since).map((p) => ({
      ...p,
      label: p.date.slice(5).replace('-', '/'),
      total: p.cash + (p.invest ?? 0) + (p.other ?? 0),
    }));
    // 投资从 recorded_since 才开始记录：之前的点只有现金。把两段画在一张堆叠图里，
    // 开始记录那天会凭空跳出一大截（而且只有 1 个点时投资面积根本画不出来，只剩一根被压扁的现金线）。
    // → 有 ≥2 个完整点：只画完整区间的总资产；不足 2 个：画现金余额走势 + 当前资产构成。
    const full = pts.filter((p) => p.invest !== null);
    const mode: 'total' | 'cash' = full.length >= 2 ? 'total' : 'cash';
    const chartPts = mode === 'total' ? full : pts;
    const hasOther = chartPts.some((p) => (p.other ?? 0) > 0);
    const first = full[0];
    const last = pts[pts.length - 1];
    const change = mode === 'total' && first && last ? last.total - first.total : null;
    const changePct = change !== null && first!.total > 0 ? (change / first!.total) * 100 : null;
    // 当前构成（最新一个点）
    const comp = last
      ? [
          { key: 'cash', label: '现金', v: last.cash },
          { key: 'invest', label: '投资', v: last.invest ?? 0 },
          { key: 'other', label: '其他', v: last.other ?? 0 },
        ].filter((c) => c.v > 0)
      : [];
    // Y 轴按数据范围留白（不从 0 开始），否则几百万的总额上 1% 的波动看起来是一条平线
    const key = mode === 'total' ? 'total' : 'cash';
    const vals = chartPts.map((p) => p[key]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.15, hi * 0.01, 1000);
    // 整齐的刻度：步长取 1/2/2.5/5 × 10^n，约 4 格
    const raw = (hi - lo + pad * 2) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
    const dMin = Math.max(0, Math.floor((lo - pad) / step) * step);
    const dMax = Math.ceil((hi + pad) / step) * step;
    const domain: [number, number] = [dMin, dMax];
    const ticks: number[] = [];
    for (let v = dMin; v <= dMax + step / 2; v += step) ticks.push(Math.round(v));
    return { pts, chartPts, mode, hasOther, last, change, changePct, comp, key, domain, ticks };
  }, [data, range]);

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Icon name="trending-up" size={16} className="text-[var(--c-accent-text)]" strokeWidth={1.75} />
          <span>资产走势</span>
        </div>
      }
    >
      {!view ? (
        <div className="h-56 animate-pulse rounded-[var(--radius-md)] bg-[var(--c-bg-alt)]" />
      ) : view.pts.length === 0 ? (
        <p className="text-[13px] text-notion-text-secondary py-6 text-center">每天自动记录一次，明天起这里就有走势了</p>
      ) : (
        <>
          {/* 读数：总资产 + 区间涨跌 */}
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 mb-3">
            <div>
              <div className="text-[11px] text-notion-text-muted">总资产 · {view.last!.date.slice(5).replace('-', '/')}</div>
              <div className="font-numeric font-semibold text-[26px] leading-tight text-notion-text">{formatYen(Math.round(view.last!.total))}</div>
            </div>
            {view.change !== null && (
              <div className="text-right text-[13px] font-numeric font-semibold" style={{ color: view.change >= 0 ? 'var(--c-success)' : 'var(--c-warning)' }}>
                {view.change >= 0 ? '+' : '−'}{formatYen(Math.abs(Math.round(view.change)))}
                {view.changePct !== null && <span className="font-normal"> ({view.changePct >= 0 ? '+' : ''}{view.changePct.toFixed(2)}%)</span>}
              </div>
            )}
          </div>

          {/* 当前资产构成；图只画一条线（总资产，或投资记录不足 2 天时的现金余额），各自按数据范围缩放 */}
          {view.comp.length > 1 && (
            <div className="mb-4">
              <div className="flex h-2 rounded-[var(--radius-pill)] overflow-hidden gap-[2px]">
                {view.comp.map((c) => (
                  <div key={c.key} style={{ width: `${(c.v / view.last!.total) * 100}%`, background: SERIES.find((x) => x.key === c.key)!.color, opacity: c.key === 'cash' ? 0.6 : 1 }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11.5px]">
                {view.comp.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1.5 text-notion-text-secondary">
                    <span className="w-2 h-2 rounded-[2px]" style={{ background: SERIES.find((x) => x.key === c.key)!.color, opacity: c.key === 'cash' ? 0.6 : 1 }} />
                    {c.label}
                    <span className="font-numeric text-notion-text">{formatYen(Math.round(c.v))}</span>
                    <span className="font-numeric text-notion-text-muted">{Math.round((c.v / view.last!.total) * 100)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {view.mode === 'cash' && (
            <div className="text-[12px] font-semibold text-notion-text-secondary mb-1">现金余额</div>
          )}

          <div className="h-48 sm:h-60 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={view.chartPts} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--c-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} tickMargin={8} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickFormatter={yenAxisTick} tickLine={false} axisLine={false} width={44}
                  domain={view.domain} ticks={view.ticks} interval={0} allowDataOverflow
                />
                <Tooltip content={<TrendTooltip hasOther={view.hasOther} />} cursor={{ stroke: 'var(--c-border-strong)', strokeWidth: 1 }} />
                <defs>
                  <linearGradient id="assetTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={view.mode === 'total' ? 'var(--c-invest)' : 'var(--c-text-muted)'} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={view.mode === 'total' ? 'var(--c-invest)' : 'var(--c-text-muted)'} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone" dataKey={view.key} name={view.mode === 'total' ? '总资产' : '现金'}
                  stroke={view.mode === 'total' ? 'var(--c-invest)' : 'var(--c-text-secondary)'} strokeWidth={2}
                  fill="url(#assetTrendFill)" baseValue="dataMin"
                  dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--c-bg-elev)' }} isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-3">
            <span />
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => pick(r.key)}
                  className={`px-2 py-0.5 rounded-[var(--radius-pill)] text-[11.5px] font-semibold transition-colors ${
                    range === r.key ? 'bg-[var(--c-accent-soft)] text-[var(--c-accent-text)]' : 'text-notion-text-muted hover:bg-[var(--c-bg-alt)]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {data?.recorded_since && view.pts.some((p) => p.invest === null) && (
            <p className="text-[11px] text-notion-text-muted mt-2">
              {view.mode === 'cash'
                ? <>投资资产从 {data.recorded_since.slice(5).replace('-', '/')} 开始记录，满 2 天后这里改为总资产走势。</>
                : <>总资产从 {data.recorded_since.slice(5).replace('-', '/')} 开始记录（之前没有投资数据）。</>}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function TrendTooltip({ active, payload, hasOther }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point & { total: number };
  const rows = [
    { name: '现金', v: p.cash },
    { name: '投资', v: p.invest },
    ...(hasOther ? [{ name: '其他', v: p.other }] : []),
  ];
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--c-border)] bg-[var(--c-bg-elev)] shadow-[var(--shadow-lg)] px-3 py-2.5 min-w-[150px]">
      <div className="text-[11px] text-notion-text-muted mb-1.5">{p.date}</div>
      <div className="space-y-1 text-[12px]">
        {rows.map((r) => (
          <div key={r.name} className="flex gap-3 justify-between">
            <span className="text-notion-text-secondary">{r.name}</span>
            <span className="font-numeric text-notion-text">{r.v == null ? '—' : formatYen(Math.round(r.v))}</span>
          </div>
        ))}
        <div className="flex gap-3 justify-between pt-1 mt-1 border-t border-[var(--c-border)]">
          <span className="text-notion-text-secondary">合计</span>
          <span className="font-numeric font-semibold text-notion-text">{formatYen(Math.round(p.total))}</span>
        </div>
      </div>
    </div>
  );
}
