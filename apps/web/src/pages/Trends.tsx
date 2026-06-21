import { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useStore } from '../lib/store';
import { Card } from '../components/Card';
import { LoadingState, EmptyState } from '../components/States';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';
import { formatYen } from '@cfp/shared';
import { apiGet } from '../lib/api';

const RANGES = [
  { label: '最近 3 期', value: 3 },
  { label: '最近 6 期', value: 6 },
  { label: '最近 12 期', value: 12 },
  { label: '全部', value: 999 },
];

export function Trends() {
  const config = useStore((s) => s.config);
  const loading = useStore((s) => s.loading);
  const [range, setRange] = useState(6);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [recording, setRecording] = useState(false);
  const calc = useStore((s) => s.calc);

  useEffect(() => {
    if (!config) return;
    (async () => {
      setLoadingCharts(true);
      try {
        const data = await apiGet<any[]>(`/snapshots?cycles=${range}`);
        setSnapshots(data);
      } finally {
        setLoadingCharts(false);
      }
    })();
  }, [config, range]);

  // 重组数据：按 cycle_id + offset_index 排好
  const chartData = useMemo(() => {
    const grouped: Record<string, any> = {};
    for (const s of snapshots) {
      const key = `${s.cycle_id}-${s.offset_index}`;
      grouped[key] = s;
    }
    const sorted = Object.values(grouped).sort((a: any, b: any) => {
      if (a.cycle_id !== b.cycle_id) return a.cycle_id < b.cycle_id ? -1 : 1;
      return a.offset_index - b.offset_index;
    });

    // 计算周期趋势（环比上一周期 offset 0 的变化）
    return sorted.map((s: any, i: number) => {
      const sameOffsetPrev = sorted
        .slice(0, i)
        .filter((p: any) => p.offset_index === s.offset_index)
        .slice(-1)[0];
      return {
        label: `${s.cycle_id} +${s.offset_index === 0 ? '0' : s.offset_index * 7}d`,
        cycle_id: s.cycle_id,
        offset_index: s.offset_index,
        net_available: s.net_available,
        daily_budget: s.daily_budget,
        unchanged: s.data_unchanged === 1,
        date: s.snapshot_date,
      };
    });
  }, [snapshots]);

  // 简单统计：最近 N 期平均
  const avgNetAvailable = useMemo(() => {
    if (chartData.length === 0) return 0;
    const offset0 = chartData.filter((d) => d.offset_index === 0);
    if (offset0.length === 0) return 0;
    return Math.round(offset0.reduce((sum, d) => sum + d.net_available, 0) / offset0.length);
  }, [chartData]);

  const trendPct = useMemo(() => {
    const offset0 = chartData.filter((d) => d.offset_index === 0);
    if (offset0.length < 2) return null;
    const latest = offset0[offset0.length - 1]!.net_available;
    const prev = offset0[offset0.length - 2]!.net_available;
    if (prev === 0) return null;
    return Math.round(((latest - prev) / prev) * 100);
  }, [chartData]);

  const onRecordNow = async () => {
    if (!calc) return;
    setRecording(true);
    try {
      await useStore.getState().recordSnapshot(calc.cycle_id, 0, '手动录入');
      const data = await apiGet<any[]>(`/snapshots?cycles=${range}`);
      setSnapshots(data);
    } finally {
      setRecording(false);
    }
  };

  if (loading && !config) return <LoadingState />;
  if (!config) return <LoadingState />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight-section flex items-center gap-2">
            <Icon name="chart" size={28} strokeWidth={1.5} className="text-notion-text-secondary" />
            <span>月度趋势</span>
          </h1>
          <p className="text-sm text-notion-text-secondary mt-1">
            每个发薪周期固定 4 个采集点 · 蓝色 = 净可用现金 · 橙色 = 日均预算
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="input w-auto"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            onClick={onRecordNow}
            className="btn-secondary flex items-center gap-1.5"
            disabled={recording || !calc}
          >
            <Icon name="add" size={14} strokeWidth={2} />
            <span>{recording ? '保存中...' : '录入快照'}</span>
          </button>
        </div>
      </header>

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="最近周期平均"
          value={formatYen(avgNetAvailable)}
        />
        <StatCard
          label="环比变化"
          value={trendPct === null ? '—' : `${trendPct > 0 ? '+' : ''}${trendPct}%`}
          valueClass={trendPct === null ? '' : trendPct >= 0 ? 'text-notion-success' : 'text-notion-warning'}
        />
        <StatCard
          label="快照总数"
          value={String(snapshots.length)}
        />
      </div>

      {/* 曲线图 */}
      <Card title="净可用现金 vs 日均预算">
        {loadingCharts ? (
          <LoadingState />
        ) : chartData.length === 0 ? (
          <EmptyState
            icon="bar-chart"
            title="还没有快照数据"
            description="录入第一批快照后，这里会显示趋势曲线"
            action={
              <button onClick={onRecordNow} className="btn-primary flex items-center gap-1.5 mx-auto" disabled={!calc}>
                <Icon name="add" size={16} strokeWidth={2} />
                <span>录入第一个快照</span>
              </button>
            }
          />
        ) : (
          <div className="h-80 sm:h-96 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  width={50}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                  width={45}
                />
                <Tooltip
                  formatter={(v: number, name: string) => {
                    if (name === '净可用现金') return [formatYen(v), name];
                    if (name === '日均预算') return [`${formatYen(v)} / 日`, name];
                    return [v, name];
                  }}
                  contentStyle={{
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="left"
                  dataKey="net_available"
                  name="净可用现金"
                  fill="#0075de"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="daily_budget"
                  name="日均预算"
                  stroke="#dd5b00"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#dd5b00' }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* 快照列表 */}
      {snapshots.length > 0 && (
        <Card title="快照列表">
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead className="bg-notion-bg-alt">
                <tr className="text-left text-notion-text-secondary">
                  <th className="px-5 py-2 font-medium">周期</th>
                  <th className="px-3 py-2 font-medium">点位</th>
                  <th className="px-3 py-2 font-medium">日期</th>
                  <th className="px-3 py-2 font-medium text-right">净可用</th>
                  <th className="px-3 py-2 font-medium text-right">日均预算</th>
                  <th className="px-5 py-2 font-medium">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-notion-border">
                {chartData.map((s, i) => (
                  <tr key={i} className={s.unchanged ? 'text-notion-text-muted' : ''}>
                    <td className="px-5 py-2 font-numeric">{s.cycle_id}</td>
                    <td className="px-3 py-2">
                      <span className="badge">{`+${s.offset_index === 0 ? '0' : s.offset_index * 7}d`}</span>
                    </td>
                    <td className="px-3 py-2 font-numeric text-notion-text-secondary">{s.date}</td>
                    <td className="px-3 py-2 text-right font-numeric font-semibold">
                      {formatYen(s.net_available)}
                    </td>
                    <td className="px-3 py-2 text-right font-numeric text-notion-warning">
                      {formatYen(s.daily_budget)} / 日
                    </td>
                    <td className="px-5 py-2 text-notion-text-muted">
                      {s.unchanged ? <span className="badge-muted badge">数据未变</span> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-notion-text-muted uppercase tracking-wider">{label}</div>
      <div className={`text-xl sm:text-2xl font-bold font-numeric mt-1 ${valueClass}`}>{value}</div>
    </div>
  );
}