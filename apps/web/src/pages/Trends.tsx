import { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Line,
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
import { formatYen, getCalendarMonthDueStatus, getCardAmountForDate } from '@cfp/shared';
import type { CashflowResult } from '@cfp/shared';
import { apiGet } from '../lib/api';

const RANGES = [
  { label: '30 天', value: '30d' },
  { label: '90 天', value: '90d' },
  { label: '6 期', value: '6c' },
  { label: '12 期', value: '12c' },
  { label: '全部', value: 'all' },
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
  const creditCards = useStore((s) => s.creditCards);
  const bills = useStore((s) => s.bills);
  const investments = useStore((s) => s.investments);
  const subscriptions = useStore((s) => s.subscriptions);

  const [range, setRange] = useState('90d');
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [cashflow, setCashflow] = useState<CashflowResult | null>(null);
  const [loadingCashflow, setLoadingCashflow] = useState(true);
  const [cashflowPeriods, setCashflowPeriods] = useState(0); // 0=本期，1=+下期，2=+未来2期

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

  // 图1：时序数据（净可用 + 日均预算）
  const chartData = useMemo(() => {
    return [...snapshots]
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
      .map((s) => ({
        date: s.snapshot_date.slice(5),
        cycle_id: s.cycle_id,
        net_available: s.net_available,
        daily_budget: s.daily_budget,
        total_income: s.total_income,
        total_investment: s.total_investment,
        total_expense: s.total_expense,
      }));
  }, [snapshots]);

  // 图2：每期收支对比 —— 按 cycle 聚合，取各字段最大值（= 周期累计终值）
  const cycleData = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const d of chartData) {
      const cur = map.get(d.cycle_id) ?? { income: 0, expense: 0 };
      map.set(d.cycle_id, {
        income: Math.max(cur.income, d.total_income),
        expense: Math.max(cur.expense, d.total_expense),
      });
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cycle, vals]) => ({
        cycle: cycle.slice(2),     // "2026-05" → "26-05"
        fullCycle: cycle,
        ...vals,
      }));
  }, [chartData]);

  const hasCycleFlow = cycleData.some((d) => d.income > 0 || d.expense > 0);

  // 图3：本期支出结构 —— 用 store 主数据估算月均各分类
  const expenseBreakdown = useMemo(() => {
    // 信用卡按自然月取实际生效金额(优先按月账单,而非早已停用的默认账单金额，
    // 否则新卡永远是 0，凭空从饼图里消失)——与"消费"页同一套口径
    const today = new Date();
    const weekendShift = config?.weekend_shift ?? false;
    const ccTotal = creditCards.reduce((s, c) => {
      const { rawDueDate } = getCalendarMonthDueStatus(c.due_day, today, weekendShift);
      return s + getCardAmountForDate(c, rawDueDate);
    }, 0);
    const billTotal = bills.reduce((s, b) => s + b.amount, 0);
    const subTotal = subscriptions.reduce((s, sub) =>
      s + (sub.billing_cycle === 'monthly' ? sub.amount : sub.amount / 12), 0);
    const invTotal = investments.reduce((s, inv) => {
      const monthly =
        inv.frequency === 'monthly' ? inv.amount :
        inv.frequency === 'weekly'  ? inv.amount * 4.33 :
        inv.frequency === 'daily'   ? inv.amount * 30 :
        inv.amount / 12;
      return s + monthly;
    }, 0);
    const total = ccTotal + billTotal + subTotal + invTotal;
    if (total === 0) return null;
    return [
      { name: '信用卡', value: ccTotal,   color: 'var(--c-accent)' },
      { name: '固定账单', value: billTotal, color: 'var(--c-warning)' },
      { name: '订阅',   value: subTotal,  color: 'var(--c-success)' },
      { name: '投资',   value: invTotal,  color: 'var(--c-invest)' },
    ].filter((d) => d.value > 0);
  }, [creditCards, bills, investments, subscriptions, config]);

  // 顶部统计卡
  const latest = chartData[chartData.length - 1];
  const prev = chartData.length >= 2 ? chartData[chartData.length - 2] : null;
  const trendPct =
    prev && prev.net_available > 0
      ? Math.round(((latest!.net_available - prev.net_available) / prev.net_available) * 100)
      : null;
  const avgNet =
    chartData.length > 0
      ? Math.round(chartData.reduce((s, d) => s + d.net_available, 0) / chartData.length)
      : 0;

  if (loading && !config) return <LoadingState />;
  if (!config) return <LoadingState />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle icon="chart" title="趋势曲线" subtitle="逐日可用现金 · 快照趋势 · 支出结构" />

      {/* 图0：逐日可用现金（自成一体，用自己的「本期/+下期」切换，放最上作头图） */}
      <Card
        title="现金流 · 逐日可用现金"
        action={
          <div className="flex gap-1">
            {[{ v: 0, l: '本期' }, { v: 1, l: '+下期' }, { v: 2, l: '+2期' }].map((o) => (
              <button
                key={o.v}
                onClick={() => setCashflowPeriods(o.v)}
                className={`px-2.5 py-1 rounded-[var(--radius-pill)] text-[12px] font-semibold transition-colors ${
                  cashflowPeriods === o.v
                    ? 'bg-[var(--c-accent-soft)] text-[var(--c-accent-text)]'
                    : 'text-notion-text-secondary hover:bg-[var(--c-bg-alt)]'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
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

      {/* ── 快照趋势区：时间范围 + 统计卡 紧贴其统领的两张快照图 ── */}
      <div className="pt-2 space-y-3">
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

        {/* 统计卡（跟随时间范围）*/}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="数据点" value={String(snapshots.length)} />
          <StatCard label="平均净可用" value={formatYen(avgNet)} />
          <StatCard
            label="最新环比"
            value={trendPct === null ? '—' : `${trendPct > 0 ? '+' : ''}${trendPct}%`}
            trend={trendPct === null ? undefined : trendPct >= 0 ? 'up' : 'down'}
          />
        </div>
      </div>

      {/* 图1：净可用现金 & 日均预算（Area + 虚线） */}
      <Card title="净可用现金 & 日均预算">
        {loadingCharts ? (
          <LoadingState />
        ) : chartData.length === 0 ? (
          <EmptyState icon="bar-chart" title="还没有快照数据" description="每天自动采集一次" />
        ) : (
          <ChartContainer>
            <ComposedChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-net" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--c-accent)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--c-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--c-border)" strokeDasharray="2 6" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" tickMargin={10} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--c-border-strong)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="net_available" name="净可用现金" stroke="var(--c-accent)" strokeWidth={2.5} fill="url(#grad-net)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--c-bg-elev)', fill: 'var(--c-accent)' }} />
              <Line type="monotone" dataKey="daily_budget" name="日均预算" stroke="var(--c-text-muted)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ChartContainer>
        )}
        <ChartLegend items={[
          { name: '净可用现金', color: 'var(--c-accent)' },
          { name: '日均预算', color: 'var(--c-text-muted)', dashed: true },
        ]} />
      </Card>

      {/* 图2：每期收支对比（分组柱状图，按发薪周期） */}
      <Card title="每期收支对比">
        {loadingCharts ? (
          <LoadingState />
        ) : !hasCycleFlow || cycleData.length === 0 ? (
          <EmptyState icon="chart" title="暂无周期收支数据" description="从今天起每日自动采集，几个周期后这里就有对比了" />
        ) : (
          <ChartContainer>
            <BarChart data={cycleData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }} barGap={4} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="var(--c-border)" strokeDasharray="2 6" />
              <XAxis dataKey="cycle" tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickLine={false} axisLine={false} tickMargin={10} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--c-border)', opacity: 0.4 }} />
              <Bar dataKey="income" name="收入" fill="var(--c-success)" radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Bar dataKey="expense" name="支出" fill="var(--c-warning)" radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ChartContainer>
        )}
        <ChartLegend items={[
          { name: '收入', color: 'var(--c-success)' },
          { name: '支出', color: 'var(--c-warning)' },
        ]} />
      </Card>

      {/* 图3：本期支出结构（环形图） */}
      <Card title="本期支出结构">
        {!expenseBreakdown ? (
          <EmptyState icon="bill" title="还没有支出项目" description="添加信用卡、账单、订阅或投资后即可查看" />
        ) : (
          <DonutChart data={expenseBreakdown} />
        )}
      </Card>
    </div>
  );
}

// ─── 环形图 ────────────────────────────────────────────────────────────────

function DonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      {/* 环形图体 */}
      <div className="relative flex-shrink-0" style={{ width: 200, height: 200 }}>
        <PieChart width={200} height={200}>
          <Pie
            data={data}
            cx={100}
            cy={100}
            innerRadius={62}
            outerRadius={88}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
            onMouseEnter={(_, idx) => setActiveIdx(idx)}
            onMouseLeave={() => setActiveIdx(null)}
          >
            {data.map((entry, idx) => (
              <Cell
                key={entry.name}
                fill={entry.color}
                opacity={activeIdx === null || activeIdx === idx ? 1 : 0.35}
                style={{ cursor: 'default', transition: 'opacity 0.2s' }}
              />
            ))}
          </Pie>
        </PieChart>
        {/* 中心文字 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {activeIdx !== null ? (
            <>
              <span className="text-[11px] text-notion-text-secondary">{data[activeIdx]!.name}</span>
              <span className="font-numeric font-semibold text-base text-notion-text leading-tight">
                {formatYen(data[activeIdx]!.value)}
              </span>
              <span className="text-[11px] text-notion-text-muted">
                {Math.round((data[activeIdx]!.value / total) * 100)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-[11px] text-notion-text-secondary">月均支出</span>
              <span className="font-numeric font-semibold text-base text-notion-text leading-tight">
                {formatYen(Math.round(total))}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 图例 + 金额 */}
      <div className="flex-1 w-full space-y-2.5">
        {data.map((item, idx) => {
          const pct = Math.round((item.value / total) * 100);
          return (
            <div
              key={item.name}
              className="flex items-center gap-3 cursor-default"
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(null)}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <span className="text-[13px] text-notion-text-secondary flex-1">{item.name}</span>
              <span className="font-numeric text-[13px] font-semibold text-notion-text">{formatYen(Math.round(item.value))}</span>
              <span className="text-[11px] text-notion-text-muted w-8 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 公共组件 ──────────────────────────────────────────────────────────────

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

function ChartLegend({ items }: { items: { name: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-[var(--c-border)]">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-1.5 text-[12px] text-notion-text-secondary">
          <span
            className="inline-block w-4 h-0.5 rounded-full"
            style={{ background: it.dashed ? `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 7px)` : it.color }}
          />
          <span>{it.name}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, trend }: { label: string; value: string; trend?: 'up' | 'down' }) {
  const trendClass = trend === 'up' ? 'text-notion-success' : trend === 'down' ? 'text-notion-warning' : '';
  return (
    <div className="card p-4">
      <div className="text-[11px] text-notion-text-muted uppercase tracking-caps font-semibold">{label}</div>
      <div className={`text-lg sm:text-2xl font-semibold font-numeric mt-1.5 flex items-center gap-1 ${trendClass}`}>
        {trend === 'up' && <span aria-hidden>▲</span>}
        {trend === 'down' && <span aria-hidden>▼</span>}
        <span>{value}</span>
      </div>
    </div>
  );
}
