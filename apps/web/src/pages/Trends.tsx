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
  const [cashflowMonths, setCashflowMonths] = useState(1); // 以今天为中心，前后各 N 个月
  const [metricKey, setMetricKey] = useState<MetricKey>('net_available');

  // 逐日现金流：以今天为中心，前后各 N 个月（过去=真实快照，未来=按计划预测）。
  // 后端按发薪周期整期返回，这里裁到 [今天−N月, 今天+N月]
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    setLoadingCashflow(true);
    const n = cashflowMonths;
    apiGet<CashflowResult>(`/dashboard/cashflow?periods=${n}&past=${n}`)
      .then((d) => {
        if (cancelled) return;
        const t = new Date(`${d.today}T00:00:00`);
        const from = new Date(t); from.setMonth(from.getMonth() - n);
        const to = new Date(t); to.setMonth(to.getMonth() + n);
        const iso = (x: Date) =>
          `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
        const lo = iso(from), hi = iso(to);
        setCashflow({ ...d, points: d.points.filter((p) => p.date >= lo && p.date <= hi) });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingCashflow(false); });
    return () => { cancelled = true; };
  }, [config, cashflowMonths]);

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
      <PageTitle icon="chart" title="趋势曲线" subtitle="收支概览 · 逐日现金 · 每期收支 · 支出结构 · 快照趋势" />

      {/* 收支概览：本期 vs 往期平均（收入 / 生活支出 / 净储蓄 / 储蓄率） */}
      {longTerm && hasCycleFlow && <CashFlowKpis cycles={longTerm.cycles} />}

      {/* 图0：逐日可用现金（自成一体，用自己的 1/3/6/12 个月切换：今天前后各 N 个月） */}
      <Card
        title="现金流 · 逐日可用现金"
        action={
          <Pills
            options={[{ v: 1, l: '1个月' }, { v: 3, l: '3个月' }, { v: 6, l: '6个月' }, { v: 12, l: '12个月' }]}
            value={cashflowMonths}
            onChange={setCashflowMonths}
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
          显示今天前后各 {cashflowMonths} 个月。灰竖线左侧是过去：有每日快照的日子用真实可用现金（余额 − 锁定）；右侧是预测：以今天真实可用现金为锚点，按每笔信用卡 / 账单 / 定投 / 收入的实际发生日逐日推演。橙色为透支线（0），跌破即入不敷出。未来月未填的信用卡按最近一期账单预估。
        </div>
      </Card>

      {/* ── 每期收支（近 N 期）── */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-notion-text">每期收支 · {periodLabel}</h2>
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

        <Card
          title={metric.label}
          action={<Pills options={METRICS.map((m) => ({ v: m.key, l: m.short }))} value={metricKey} onChange={setMetricKey} />}
        >
          {!loadingCharts && chartData.length > 0 && (
            // 图表标题区：一个主数字 + 区间变化（股票/理财 App 通用的「图表即读数」写法）
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 mb-3">
              <div>
                <div className="text-[11px] text-notion-text-muted">最新 · {latest!.fullDate.slice(5)}</div>
                <div className="font-display font-semibold text-[26px] leading-tight text-notion-text">{formatYen(latest!.value)}</div>
              </div>
              <div className="text-right text-[12px] leading-relaxed">
                {change !== null && (
                  <div className="font-numeric font-semibold" style={{ color: change >= 0 ? 'var(--c-success)' : 'var(--c-warning)' }}>
                    {change >= 0 ? '+' : '−'}{formatYen(Math.abs(change))}
                    {changePct !== null && <span className="font-normal"> ({changePct >= 0 ? '+' : ''}{changePct}%)</span>}
                    <span className="text-notion-text-muted font-normal"> 区间变化</span>
                  </div>
                )}
                {lowest && (
                  <div className="text-notion-text-muted">
                    区间最低 <span className="font-numeric text-notion-text-secondary">{formatYen(lowest.value)}</span>（{lowest.fullDate.slice(5)}）
                  </div>
                )}
              </div>
            </div>
          )}
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

// ─── 收支概览 KPI ─────────────────────────────────────────────────────────────

type KpiDef = {
  key: string;
  label: string;
  hint: string;
  values: number[];        // 按周期升序，最后一个 = 本期
  format: (v: number) => string;
  /** 上升是好事吗：收入/储蓄 ↑ 好，支出 ↑ 不好 */
  higherIsBetter: boolean;
  /** 百分比类指标的差值用「个百分点」而非相对百分比 */
  isRate?: boolean;
};

/**
 * 参考 Monarch / Copilot / Money Forward 的现金流报表：四个核心数字放在同一块面板里，
 * 每格 = 本期值 + 对比往期平均的变化 + 近 N 期迷你走势；格与格之间用细分隔线，不再各自一张卡片。
 * 净储蓄 = 收入 − 生活支出（定投算储蓄）；储蓄率 = 净储蓄 ÷ 收入。
 */
function CashFlowKpis({ cycles }: { cycles: { cycle_id: string; income: number; consume: number }[] }) {
  const n = cycles.length;
  const current = cycles[n - 1]!;
  const rate = (c: { income: number; consume: number }) => (c.income > 0 ? ((c.income - c.consume) / c.income) * 100 : 0);
  const kpis: KpiDef[] = [
    { key: 'income', label: '收入', hint: '工资、副业等到账', values: cycles.map((c) => c.income), format: formatYen, higherIsBetter: true },
    { key: 'spend', label: '生活支出', hint: '信用卡、账单、订阅、临时支出', values: cycles.map((c) => c.consume), format: formatYen, higherIsBetter: false },
    { key: 'save', label: '净储蓄', hint: '收入 − 生活支出（含定投）', values: cycles.map((c) => c.income - c.consume), format: (v) => `${v < 0 ? '−' : ''}${formatYen(Math.abs(v))}`, higherIsBetter: true },
    { key: 'rate', label: '储蓄率', hint: '净储蓄 ÷ 收入', values: cycles.map(rate), format: (v) => `${Math.round(v)}%`, higherIsBetter: true, isRate: true },
  ];

  return (
    <Card
      title={
        <div className="flex items-baseline gap-2">
          <span>收支概览</span>
          <span className="text-[12px] font-normal text-notion-text-muted">本期 {current.cycle_id}{n > 1 ? ` · 对比前 ${n - 1} 期平均` : ''}</span>
        </div>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 -mx-5 -mb-5 border-t border-[var(--c-border)]">
        {kpis.map((k, i) => (
          <KpiTile key={k.key} kpi={k} className={[
            // 细分隔线：移动端 2×2，桌面 1×4
            i % 2 === 1 ? 'border-l' : '',
            i >= 2 ? 'border-t lg:border-t-0' : '',
            i === 2 ? 'lg:border-l' : '',
          ].join(' ')} />
        ))}
      </div>
    </Card>
  );
}

function KpiTile({ kpi, className = '' }: { kpi: KpiDef; className?: string }) {
  const vals = kpi.values;
  const cur = vals[vals.length - 1]!;
  const prev = vals.slice(0, -1);
  const base = prev.length > 0 ? prev.reduce((s, v) => s + v, 0) / prev.length : null;

  let deltaText: string | null = null;
  let good: boolean | null = null;
  if (base !== null) {
    const diff = cur - base;
    if (kpi.isRate) {
      const pts = Math.round(diff);
      deltaText = `${pts > 0 ? '↑' : pts < 0 ? '↓' : ''}${Math.abs(pts)} 个百分点`;
      good = pts === 0 ? null : (pts > 0) === kpi.higherIsBetter;
    } else if (Math.abs(base) > 0) {
      const pct = Math.round((diff / Math.abs(base)) * 100);
      deltaText = `${pct > 0 ? '↑' : pct < 0 ? '↓' : ''}${Math.abs(pct)}%`;
      good = pct === 0 ? null : (pct > 0) === kpi.higherIsBetter;
    }
  }

  return (
    <div className={`p-4 sm:p-5 border-[var(--c-border)] min-w-0 ${className}`} title={kpi.hint}>
      <div className="text-[12px] text-notion-text-secondary">{kpi.label}</div>
      <div className="font-numeric font-semibold text-[20px] sm:text-[24px] leading-tight text-notion-text mt-1 truncate">
        {kpi.format(cur)}
      </div>
      <div className="text-[11px] mt-1 truncate">
        {deltaText ? (
          <>
            <span className="font-semibold" style={{ color: good === null ? 'var(--c-text-muted)' : good ? 'var(--c-success)' : 'var(--c-warning)' }}>
              {deltaText}
            </span>
            <span className="text-notion-text-muted"> vs 均值 {kpi.format(base!)}</span>
          </>
        ) : (
          <span className="text-notion-text-muted">{kpi.hint}</span>
        )}
      </div>
      {vals.length > 1 && <Sparkline values={vals} />}
    </div>
  );
}

/** 迷你走势：2px 线 + 末点圆点（本期），无坐标轴 */
function Sparkline({ values }: { values: number[] }) {
  const W = 100, H = 28, pad = 3;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - pad - ((v - min) / span) * (H - pad * 2),
  ] as const);
  const last = pts[pts.length - 1]!;
  // 线条用拉伸的 SVG；末点用 HTML 圆点叠在上面（拉伸的 viewBox 会把 <circle> 压成椭圆）
  return (
    <div className="relative h-7 mt-2" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
        <polyline
          points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none" stroke="var(--c-text-muted)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
          vectorEffect="non-scaling-stroke" opacity={0.55}
        />
      </svg>
      <span
        className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-[var(--c-accent)] ring-2 ring-[var(--c-bg-elev)]"
        style={{ left: `${last[0]}%`, top: `${(last[1] / H) * 100}%` }}
      />
    </div>
  );
}
