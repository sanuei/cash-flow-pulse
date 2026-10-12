/**
 * CashFlowChart — 逐日可用现金曲线
 *   过去段实线 + 未来段虚线，以今天真实可用现金为锚点，
 *   按每笔信用卡 / 账单 / 定投 / 收入的实际发生日推演（数据来自 /dashboard/cashflow）。
 *   Trends（完整版）与 Overview（精简版）共用；用 heightClass 控制高度。
 */
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { formatYen } from '@cfp/shared';
import type { CashflowResult } from '@cfp/shared';
import { yenAxisTick } from '../lib/chartFormat';

export function CashFlowChart({
  data,
  heightClass = 'h-64 sm:h-80',
  compact = false,
}: {
  data: CashflowResult;
  heightClass?: string;
  compact?: boolean;
}) {
  const todayStr = data.today;
  // x 轴用时间戳（数值轴）而不是 "MM-DD" 字符串：跨年的 12 个月范围里 MM-DD 会重复，
  // 快照缺天时数值轴也能按真实时间间距画，不会把缺口挤掉
  const ts = (d: string) => new Date(`${d}T00:00:00`).getTime();
  const chart = data.points.map((p) => ({
    t: ts(p.date),
    date: p.date,
    past: p.is_past ? p.balance : null,
    future: (!p.is_past || p.date === todayStr) ? p.balance : null,
    balance: p.balance,
    actual: p.actual,
    events: p.events,
  }));
  const todayT = ts(todayStr);
  const first = chart[0]?.t ?? todayT;
  const last = chart[chart.length - 1]?.t ?? todayT;
  const longRange = last - first > 120 * 86400000;
  const tickFmt = (v: number) => {
    const d = new Date(v);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return longRange
      ? `${String(d.getFullYear()).slice(2)}/${mm}`
      : `${mm}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return (
    <div className={`${heightClass} -mx-2`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chart} margin={{ top: 12, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="grad-cash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--c-accent)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--c-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--c-border)" />
          <XAxis
            dataKey="t" type="number" scale="time" domain={[first, last]}
            tickFormatter={tickFmt} tickCount={compact ? 4 : 7}
            tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickLine={false} axisLine={false} tickMargin={10}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickFormatter={yenAxisTick} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<CashFlowTooltip />} cursor={{ stroke: 'var(--c-border-strong)', strokeWidth: 1 }} />
          <ReferenceLine y={0} stroke="var(--c-warning)" strokeOpacity={0.55} strokeDasharray="4 4" label={compact ? undefined : { value: '透支线', position: 'insideBottomLeft', fontSize: 10, fill: 'var(--c-warning)' }} />
          <ReferenceLine x={todayT} stroke="var(--c-text-muted)" strokeDasharray="3 3" label={compact ? undefined : { value: '今天', position: 'insideTopRight', fontSize: 10, fill: 'var(--c-text-muted)' }} />
          <Area type="monotone" dataKey="past" name="已过去" stroke="var(--c-accent)" strokeWidth={2.5} fill="url(#grad-cash)" dot={false} connectNulls />
          <Line type="monotone" dataKey="future" name="预测" stroke="var(--c-accent)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function CashFlowTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  const events = pt?.events ?? [];
  const label = pt?.date ? `${pt.date}${pt.actual ? ' · 实际' : pt.past == null ? ' · 预测' : ''}` : '';
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--c-border)] bg-[var(--c-bg-elev)] shadow-[var(--shadow-lg)] px-3 py-2.5 min-w-[150px]">
      <div className="text-[11px] text-notion-text-muted mb-1">{label}</div>
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-notion-text-secondary">可用现金</span>
        <span className="font-numeric font-semibold text-notion-text ml-auto">{formatYen(pt?.balance ?? 0)}</span>
      </div>
      {events.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--c-border)] space-y-0.5">
          {events.map((e: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-notion-text-muted truncate">{e.label}</span>
              <span className={`font-numeric ml-auto flex-shrink-0 ${e.amount >= 0 ? 'text-notion-success' : 'text-notion-warning'}`}>
                {e.amount >= 0 ? '+' : ''}{formatYen(e.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
