import { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
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
import { formatYen } from '@cfp/shared';
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
  // cycle-based
  return `/snapshots?cycles=${rangeValue.slice(0, -1)}`;
}

export function Trends() {
  const config = useStore((s) => s.config);
  const loading = useStore((s) => s.loading);
  const [range, setRange] = useState('90d');
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loadingCharts, setLoadingCharts] = useState(false);

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

  // 按日期排序，X轴连续
  const chartData = useMemo(() => {
    return [...snapshots]
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
      .map((s) => ({
        date: s.snapshot_date.slice(5), // MM-DD
        fullDate: s.snapshot_date,
        net_available: s.net_available,
        daily_budget: s.daily_budget,
        total_income: s.total_income,
        total_investment: s.total_investment,
        total_expense: s.total_expense,
        unchanged: s.data_unchanged === 1,
      }));
  }, [snapshots]);

  // 是否有收入/投资/消费数据（v1.1 之前快照全是 0）
  const hasFlowData = useMemo(
    () => chartData.some((d) => d.total_income > 0 || d.total_expense > 0),
    [chartData]
  );

  // 统计卡
  const latest = chartData[chartData.length - 1];
  const prev = chartData.length >= 2 ? chartData[chartData.length - 2] : null;
  const trendPct =
    prev && prev.net_available > 0
      ? Math.round(((latest!.net_available - prev.net_available) / prev.net_available) * 100)
      : null;
  const avgNetAvailable =
    chartData.length > 0
      ? Math.round(chartData.reduce((s, d) => s + d.net_available, 0) / chartData.length)
      : 0;

  if (loading && !config) return <LoadingState />;
  if (!config) return <LoadingState />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle icon="chart" title="趋势曲线" subtitle="净可用现金 · 日均预算 · 收入/投资/消费对比" />

      {/* 时间范围 — 分段药丸 */}
      <div className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`px-3.5 py-1.5 rounded-[var(--radius-pill)] text-[13px] font-semibold transition-all duration-[var(--dur-base)] ease-[var(--ease-out-expo)] ${
              range === r.value
                ? 'bg-[var(--c-accent)] text-[var(--c-text-on-accent)] shadow-[var(--glow-accent)]'
                : 'bg-[var(--c-bg-alt)] text-notion-text-secondary border border-[var(--c-border)] hover:border-[var(--c-border-strong)] hover:text-notion-text'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 统计卡 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="数据点" value={String(snapshots.length)} />
        <StatCard label="平均净可用" value={formatYen(avgNetAvailable)} />
        <StatCard
          label="最新环比"
          value={trendPct === null ? '—' : `${trendPct > 0 ? '+' : ''}${trendPct}%`}
          trend={trendPct === null ? undefined : trendPct >= 0 ? 'up' : 'down'}
        />
      </div>

      {/* 图1：净可用 + 日均预算（面积 + 渐变） */}
      <Card title="净可用现金 & 日均预算">
        {loadingCharts ? (
          <LoadingState />
        ) : chartData.length === 0 ? (
          <EmptyState
            icon="bar-chart"
            title="还没有快照数据"
            description="每天自动采集一次，或手动在总览页录入快照"
          />
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
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tickMargin={10}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--c-border-strong)', strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="net_available"
                name="净可用现金"
                stroke="var(--c-accent)"
                strokeWidth={2.5}
                fill="url(#grad-net)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--c-bg-elev)', fill: 'var(--c-accent)' }}
              />
              <Line
                type="monotone"
                dataKey="daily_budget"
                name="日均预算"
                stroke="var(--c-text-muted)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ChartContainer>
        )}
        <ChartLegend
          items={[
            { name: '净可用现金', color: 'var(--c-accent)' },
            { name: '日均预算', color: 'var(--c-text-muted)', dashed: true },
          ]}
        />
      </Card>

      {/* 图2：收入 / 投资 / 消费对比（仅 v1.1 后有数据） */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <span>收入 / 投资 / 消费对比</span>
            {!hasFlowData && (
              <span className="badge-muted badge text-[10px] px-1.5 py-0.5">数据从升级后开始累积</span>
            )}
          </div>
        }
      >
        {loadingCharts ? (
          <LoadingState />
        ) : !hasFlowData ? (
          <EmptyState
            icon="chart"
            title="暂无收入/投资/消费历史数据"
            description="从今天起每日自动采集，几天后这里就有折线了"
          />
        ) : (
          <ChartContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--c-border)" strokeDasharray="2 6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tickMargin={10}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--c-border-strong)', strokeWidth: 1 }} />
              <Line type="monotone" dataKey="total_income" name="收入" stroke="var(--c-success)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--c-bg-elev)' }} />
              <Line type="monotone" dataKey="total_investment" name="投资" stroke="var(--c-accent)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--c-bg-elev)' }} />
              <Line type="monotone" dataKey="total_expense" name="消费" stroke="var(--c-warning)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--c-bg-elev)' }} />
            </LineChart>
          </ChartContainer>
        )}
        <ChartLegend
          items={[
            { name: '收入', color: 'var(--c-success)' },
            { name: '投资', color: 'var(--c-accent)' },
            { name: '消费', color: 'var(--c-warning)' },
          ]}
        />
      </Card>
    </div>
  );
}

function ChartContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-72 sm:h-96 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

// 自定义 Tooltip — 圆角浮层 + 衬线数字，跟随主题
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--c-border)] bg-[var(--c-bg-elev)] shadow-[var(--shadow-lg)] px-3 py-2.5 min-w-[140px]">
      <div className="text-[11px] text-notion-text-muted mb-1.5">{label}</div>
      <div className="space-y-1">
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2 text-[12px]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-notion-text-secondary">{p.name}</span>
            <span className="font-numeric font-semibold text-notion-text ml-auto">{formatYen(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 自定义图例 — 比 recharts 默认更轻、风格统一
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
