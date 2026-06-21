import { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useStore } from '../lib/store';
import { Card } from '../components/Card';
import { PageTitle } from '../components/PageTitle';
import { LoadingState, EmptyState } from '../components/States';
import { Icon } from '../components/Icon';
import { formatYen } from '@cfp/shared';
import { apiGet } from '../lib/api';

const RANGES = [
  { label: '最近 30 天', value: '30d' },
  { label: '最近 90 天', value: '90d' },
  { label: '最近 6 期', value: '6c' },
  { label: '最近 12 期', value: '12c' },
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
  const calc = useStore((s) => s.calc);
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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <PageTitle icon="chart" title="趋势曲线" subtitle="净可用现金 · 日均预算 · 收入/投资/消费对比" />
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="input w-auto self-start sm:self-auto"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* 统计卡 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="数据点" value={String(snapshots.length)} />
        <StatCard label="平均净可用" value={formatYen(avgNetAvailable)} />
        <StatCard
          label="最新环比"
          value={trendPct === null ? '—' : `${trendPct > 0 ? '+' : ''}${trendPct}%`}
          valueClass={trendPct === null ? '' : trendPct >= 0 ? 'text-notion-success' : 'text-notion-warning'}
        />
      </div>

      {/* 图1：净可用 + 日均预算折线图 */}
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
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                width={48}
              />
              <Tooltip
                labelFormatter={(l) => `日期：${l}`}
                formatter={(v: number, name: string) => [formatYen(v), name]}
                contentStyle={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="net_available"
                name="净可用现金"
                stroke="#0075de"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="daily_budget"
                name="日均预算"
                stroke="#dd5b00"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4 }}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ChartContainer>
        )}
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
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                width={48}
              />
              <Tooltip
                labelFormatter={(l) => `日期：${l}`}
                formatter={(v: number, name: string) => [formatYen(v), name]}
                contentStyle={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="total_income"
                name="收入"
                stroke="#0e9f6e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="total_investment"
                name="投资"
                stroke="#6875f5"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="total_expense"
                name="消费"
                stroke="#e02424"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ChartContainer>
        )}
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

function StatCard({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-notion-text-muted uppercase tracking-wider">{label}</div>
      <div className={`text-lg sm:text-2xl font-bold font-numeric mt-1 ${valueClass}`}>{value}</div>
    </div>
  );
}
