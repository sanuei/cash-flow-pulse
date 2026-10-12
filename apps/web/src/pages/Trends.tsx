import { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  BarChart,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useStore } from '../lib/store';
import { Card } from '../components/Card';
import { PageTitle } from '../components/PageTitle';
import { LoadingState, EmptyState } from '../components/States';
import { CashFlowChart } from '../components/CashFlowChart';
import { HorizontalBarChart, type BarItem } from '../components/HorizontalBarChart';
import { formatYen } from '@cfp/shared';
import type { CashflowResult } from '@cfp/shared';
import { apiGet } from '../lib/api';
import { useLongTermStats } from '../lib/longTerm';
import { yenAxisTick } from '../lib/chartFormat';

const RANGES = [
  { label: '30 天', value: '30d' },
  { label: '90 天', value: '90d' },
  { label: '6 期', value: '6c' },
  { label: '12 期', value: '12c' },
  { label: '全部', value: 'all' },
];

// 快照曲线可切换的指标（一次只画一个，单轴）
type MetricKey = 'net_available' | 'daily_budget';
const METRICS: { key: MetricKey; label: string; short: string; hint: string }[] = [
  {
    key: 'net_available', label: '净可用现金走势', short: '净可用现金',
    hint: '每日自动快照：现金余额 − 锁定金额 − 本期剩余应付。',
  },
  {
    key: 'daily_budget', label: '日均预算走势', short: '日均预算',
    hint: '每日自动快照：净可用现金 ÷ 距发薪日天数。',
  },
];

type SnapshotRow = {
  id: string;
  cycle_id: string;
  offset_index: number;
  snapshot_date: string;
  net_available: number;
  daily_budget: number;
  total_income: number;
  total_investment: number;
  total_expense: number;
  data_unchanged: 0 | 1;
};

function parseRangeParam(rangeValue: string): string {
  if (rangeValue === 'all') return '/snapshots';
  if (rangeValue.endsWith('d')) return `/snapshots?days=${rangeValue.slice(0, -1)}`;
  return `/snapshots?cycles=${rangeValue.slice(0, -1)}`;
}

export function Trends() {
  const config = useStore((s) => s.config);
  const loading = useStore((s) => s.loading);
  const longTerm = useLongTermStats();

  const [range, setRange] = useState('90d');
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [cashflow, setCashflow] = useState<CashflowResult | null>(null);
  const [loadingCashflow, setLoadingCashflow] = useState(true);
  const [cashflowPeriods, setCashflowPeriods] = useState(0); // 0=本期，1=+下期，2=+未来2期
  const [metricKey, setMetricKey] = useState<MetricKey>('net_available');

  // 逐日现金流预测（可延伸未来周期；不随上方 range 变）
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    setLoadingCashflow(true);
    apiGet<CashflowResult>(`/dashboard/cashflow?periods=${cashflowPeriods}`)
      .then((d) => { if (!cancelled) setCashflow(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingCashflow(false); });
    return () => { cancelled = true; };
  }, [config, cashflowPeriods]);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    setLoadingCharts(true);
    apiGet<SnapshotRow[]>(parseRangeParam(range))
      .then((data) => { if (!cancelled) setSnapshots(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingCharts(false); });
    return () => { cancelled = true; };
  }, [config, range]);

  // 快照曲线：一次只看一个指标（单轴）——净可用现金与日均预算量级差 30 倍，
  // 叠在同一 y 轴上日均预算会被压成一条贴底的直线，所以改成手动切换
  const metric = METRICS.find((m) => m.key === metricKey)!;
  const chartData = useMemo(() => {
    return [...snapshots]
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
      .map((s) => ({ date: s.snapshot_date.slice(5), fullDate: s.snapshot_date, value: s[metricKey] }));
  }, [snapshots, metricKey]);

  // 统计卡（跟随时间范围与所选指标）
  const first = chartData[0];
  const latest = chartData[chartData.length - 1];
  const change = first && latest ? latest.value - first.value : null;
  const changePct = first && latest && first.value > 0 ? Math.round(((latest.value - first.value) / first.value) * 100) : null;
  const lowest = chartData.length > 0
    ? chartData.reduce((m, d) => (d.value < m.value ? d : m))
    : null;

  // 近 N 期收支（与首页「可支撑月数」/「财务自由」、AI 诊断同一口径：按规则逐期重算）
  const cycleData = useMemo(() => {
    if (!longTerm) return [];
    return longTerm.cycles.map((c) => ({
      cycle: c.cycle_id.slice(2), // "2026-05" → "26-05"
      fullCycle: c.cycle_id,
      income: c.income,
      consume: c.consume,
      invest: c.invest,
      surplus: c.surplus,
    }));
  }, [longTerm]);
  const agg = longTerm?.agg;
  const hasCycleFlow = cycleData.some((d) => d.income > 0 || d.consume > 0 || d.invest > 0);
  const periodLabel = agg && agg.n > 1 ? `近 ${agg.n} 期` : '本期';
  const savingsRate = agg && agg.income > 0 ? Math.round((agg.surplus / agg.income) * 100) : null;

  // 支出结构：近 N 期月均（不是只看本月，避免大额账单月份失真）
  const structure = useMemo(() => {
    if (!longTerm || longTerm.cycles.length === 0) return null;
    const n = longTerm.cycles.length;
    const avg = (k: 'card' | 'bills' | 'subscriptions' | 'oneOff' | 'invest') =>
      Math.round(longTerm.cycles.reduce((s, c) => s + (c[k] ?? 0), 0) / n);
    const items: BarItem[] = [
      { name: '信用卡', amount: avg('card'), color: 'var(--c-warning)', icon: 'card' },
      { name: '固定账单', amount: avg('bills'), color: 'var(--c-warning)', icon: 'bill' },
      { name: '订阅', amount: avg('subscriptions'), color: 'var(--c-warning)', icon: 'subscription' },
      { name: '临时支出', amount: avg('oneOff'), color: 'var(--c-warning)', icon: 'calendar' },
      { name: '固定投资', amount: avg('invest'), color: 'var(--c-invest)', icon: 'investment' },
    ];
    const total = items.reduce((s, it) => s + it.amount, 0);
    return total > 0 ? { items, total } : null;
  }, [longTerm]);

  if (loading && !config) return <LoadingState />;
  if (!config) return <LoadingState />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle icon="chart" title="趋势曲线" subtitle="逐日现金 · 每期收支 · 支出结构 · 快照趋势" />

      {/* 图0：逐日可用现金（自成一体，用自己的「本期/+下期」切换，放最上作头图） */}
      <Card
        title="现金流 · 逐日可用现金"
        action={
          <Pills
            options={[{ v: 0, l: '本期' }, { v: 1, l: '+下期' }, { v: 2, l: '+2期' }]}
            value={cashflowPeriods}
            onChange={setCashflowPeriods}
          />
        }
      >
        {loadingCashflow ? (
          <LoadingState />
        ) : !cashflow || cashflow.points.length === 0 ? (
          <EmptyState icon="bar-chart" title="暂无现金流数据" description="添加现金账户与收支项目后即可查看" />
        ) : (
          <CashFlowChart data={cashflow} />
        )}
        <ChartLegend items={[
          { name: '已过去（实际）', color: 'var(--c-accent)' },
          { name: '未来（预测）', color: 'var(--c-accent)', dashed: true },
        ]} />
        <div className="mt-2 text-[11px] text-notion-text-muted leading-relaxed">
          以今天真实可用现金为锚点，按每笔信用卡 / 账单 / 定投 / 收入的实际发生日逐日推演。灰竖线为今天，右侧为预测；橙色为透支线（0），跌破即入不敷出。未来月未填的信用卡按最近一期账单预估。
        </div>
      </Card>

      {/* ── 每期收支（近 N 期）── */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-notion-text">每期收支 · {periodLabel}</h2>
        {agg && hasCycleFlow && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="月均收入" value={formatYen(agg.avgIncome)} />
            <StatCard label="月均生活成本" value={formatYen(agg.avgConsume)} />
            <StatCard
              label="储蓄率"
              value={savingsRate === null ? '—' : `${savingsRate}%`}
              trend={savingsRate === null ? undefined : savingsRate >= 0 ? 'up' : 'down'}
            />
          </div>
        )}
        <Card>
          {!hasCycleFlow ? (
            <EmptyState icon="chart" title="暂无收支数据" description="添加收入、信用卡、账单等项目后即可查看" />
          ) : (
            <ChartContainer>
              <BarChart data={cycleData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }} barGap={4} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="var(--c-border)" />
                <XAxis dataKey="cycle" tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickLine={false} axisLine={false} tickMargin={10} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickFormatter={yenAxisTick} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<CycleTooltip />} cursor={{ fill: 'var(--c-border)', opacity: 0.4 }} />
                <Bar dataKey="income" name="收入" stackId="in" fill="var(--c-success)" maxBarSize={28} shape={<SegShape role="top" />} />
                <Bar dataKey="consume" name="消费" stackId="out" fill="var(--c-warning)" maxBarSize={28} shape={<SegShape role="bottom" />} />
                <Bar dataKey="invest" name="投资" stackId="out" fill="var(--c-invest)" maxBarSize={28} shape={<SegShape role="top" />} />
              </BarChart>
            </ChartContainer>
          )}
          <ChartLegend items={[
            { name: '收入', color: 'var(--c-success)', block: true },
            { name: '消费', color: 'var(--c-warning)', block: true },
            { name: '投资', color: 'var(--c-invest)', block: true },
          ]} />
          <div className="mt-2 text-[11px] text-notion-text-muted leading-relaxed">
            每期左柱为收入，右柱为支出（消费 + 投资）；两柱之差即当期结余，点按柱子查看明细。按当前录入的收支规则逐期计算，与首页、AI 诊断口径一致。
          </div>
        </Card>
      </section>

      {/* ── 支出结构（近 N 期月均）── */}
      <Card
        title={`支出结构 · ${periodLabel}月均`}
        action={structure ? <span className="font-numeric text-[13px] text-notion-text-secondary">{formatYen(structure.total)}/月</span> : undefined}
      >
        {!structure ? (
          <EmptyState icon="bill" title="还没有支出项目" description="添加信用卡、账单、订阅或投资后即可查看" />
        ) : (
          <HorizontalBarChart items={structure.items} total={structure.total} />
        )}
      </Card>

      {/* ── 快照趋势：时间范围 + 指标切换 + 统计卡 + 曲线 ── */}
      <section className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-notion-text">快照趋势</h2>
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1 rounded-[var(--radius-pill)] text-[12.5px] font-semibold transition-all duration-[var(--dur-base)] ease-[var(--ease-out-expo)] ${
                  range === r.value
                    ? 'bg-[var(--c-accent)] text-[var(--c-text-on-accent)] shadow-[var(--glow-accent)]'
                    : 'bg-[var(--c-bg-alt)] text-notion-text-secondary border border-[var(--c-border)] hover:border-[var(--c-border-strong)] hover:text-notion-text'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {chartData.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={`最新${metric.short}`} value={formatYen(latest!.value)} />
            <StatCard
              label="区间变化"
              value={change === null ? '—' : `${change >= 0 ? '+' : '−'}${formatYen(Math.abs(change))}`}
              sub={changePct === null ? undefined : `${changePct >= 0 ? '+' : ''}${changePct}%`}
              trend={change === null || change === 0 ? undefined : change > 0 ? 'up' : 'down'}
            />
            <StatCard label="区间最低" value={formatYen(lowest!.value)} sub={lowest!.fullDate.slice(5)} />
          </div>
        )}

        <Card
          title={metric.label}
          action={<Pills options={METRICS.map((m) => ({ v: m.key, l: m.short }))} value={metricKey} onChange={setMetricKey} />}
        >
          {loadingCharts ? (
            <LoadingState />
          ) : chartData.length === 0 ? (
            <EmptyState icon="bar-chart" title="还没有快照数据" description="每天自动采集一次" />
          ) : (
            <ChartContainer>
              <AreaChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-snap" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--c-accent)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--c-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--c-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" tickMargin={10} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickFormatter={yenAxisTick} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--c-border-strong)', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="value" name={metric.short} stroke="var(--c-accent)" strokeWidth={2} fill="url(#grad-snap)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--c-bg-elev)', fill: 'var(--c-accent)' }} />
              </AreaChart>
            </ChartContainer>
          )}
          <div className="mt-3 pt-3 border-t border-[var(--c-border)] text-[11px] text-notion-text-muted leading-relaxed">
            {metric.hint}
          </div>
        </Card>
      </section>
    </div>
  );
}

// ─── 公共组件 ──────────────────────────────────────────────────────────────

function Pills<T extends string | number>({
  options, value, onChange,
}: { options: { v: T; l: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          className={`px-2.5 py-1 rounded-[var(--radius-pill)] text-[12px] font-semibold transition-colors ${
            value === o.v
              ? 'bg-[var(--c-accent-soft)] text-[var(--c-accent-text)]'
              : 'text-notion-text-secondary hover:bg-[var(--c-bg-alt)]'
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

/**
 * 柱形：顶部 3px 圆角、底部贴基线。
 * 堆叠柱的下段（消费）在上方还有投资时顶端让出 2px，形成段间缝（卡片是半透明玻璃底，
 * 用描边模拟缝隙会透出色差，所以直接缩短矩形）。
 */
function SegShape(props: any) {
  const { x, y, width, height, fill, payload, role } = props;
  if (!height || height <= 0 || !width) return null;
  const hasAbove = role === 'bottom' && (payload?.invest ?? 0) > 0;
  const gap = hasAbove ? 2 : 0;
  const top = y + gap;
  const h = Math.max(0, height - gap);
  const r = hasAbove ? 0 : Math.min(3, width / 2, h);
  const d = r > 0
    ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + h} Z`
    : `M${x},${top + h} V${top} H${x + width} V${top + h} Z`;
  return <path d={d} fill={fill} />;
}

function CycleTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { fullCycle: string; income: number; consume: number; invest: number; surplus: number };
  const rate = d.income > 0 ? Math.round((d.surplus / d.income) * 100) : null;
  const rows = [
    { name: '收入', v: d.income, color: 'var(--c-success)' },
    { name: '消费', v: d.consume, color: 'var(--c-warning)' },
    { name: '投资', v: d.invest, color: 'var(--c-invest)' },
  ];
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--c-border)] bg-[var(--c-bg-elev)] shadow-[var(--shadow-lg)] px-3 py-2.5 min-w-[160px]">
      <div className="text-[11px] text-notion-text-muted mb-1.5">周期 {d.fullCycle}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2 text-[12px]">
            <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: r.color }} />
            <span className="text-notion-text-secondary">{r.name}</span>
            <span className="font-numeric tabular-nums text-notion-text ml-auto">{formatYen(r.v)}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-[12px] pt-1 mt-1 border-t border-[var(--c-border)]">
          <span className="text-notion-text-secondary">结余</span>
          <span className={`font-numeric tabular-nums font-semibold ml-auto ${d.surplus >= 0 ? 'text-notion-success' : 'text-notion-warning'}`}>
            {d.surplus >= 0 ? '+' : '−'}{formatYen(Math.abs(d.surplus))}
          </span>
        </div>
        {rate !== null && (
          <div className="flex items-center gap-2 text-[11px] text-notion-text-muted">
            <span>储蓄率</span>
            <span className="font-numeric tabular-nums ml-auto">{rate}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ChartContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-64 sm:h-80 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--c-border)] bg-[var(--c-bg-elev)] shadow-[var(--shadow-lg)] px-3 py-2.5 min-w-[140px]">
      <div className="text-[11px] text-notion-text-muted mb-1.5">{label}</div>
      <div className="space-y-1">
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2 text-[12px]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color ?? p.fill }} />
            <span className="text-notion-text-secondary">{p.name}</span>
            <span className="font-numeric font-semibold text-notion-text ml-auto">{formatYen(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartLegend({ items }: { items: { name: string; color: string; dashed?: boolean; block?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-[var(--c-border)]">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-1.5 text-[12px] text-notion-text-secondary">
          {it.block ? (
            <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: it.color }} />
          ) : (
            <span
              className="inline-block w-4 h-0.5 rounded-full"
              style={{ background: it.dashed ? `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 7px)` : it.color }}
            />
          )}
          <span>{it.name}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, trend, sub }: { label: string; value: string; trend?: 'up' | 'down'; sub?: string }) {
  // 三列并排在手机上每格只有 ~90px，金额用小一号字并截断，避免撑破
  const trendClass = trend === 'up' ? 'text-notion-success' : trend === 'down' ? 'text-notion-warning' : 'text-notion-text';
  return (
    <div className="card p-3 sm:p-4 min-w-0">
      <div className="text-[11px] text-notion-text-muted font-semibold truncate">{label}</div>
      <div className={`text-[15px] sm:text-2xl font-semibold font-numeric mt-1 truncate ${trendClass}`} title={value}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-notion-text-muted font-numeric mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
