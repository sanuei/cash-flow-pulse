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
  const chart = data.points.map((p) => ({
    date: p.date.slice(5),
    past: p.is_past ? p.balance : null,
    future: (!p.is_past || p.date === todayStr) ? p.balance : null,
    balance: p.balance,
    events: p.events,
  }));
  const todayLabel = todayStr.slice(5);
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
          <CartesianGrid vertical={false} stroke="var(--c-border)" strokeDasharray="2 6" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} tickMargin={10} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<CashFlowTooltip />} cursor={{ stroke: 'var(--c-border-strong)', strokeWidth: 1 }} />
          <ReferenceLine y={0} stroke="var(--c-warning)" strokeOpacity={0.55} strokeDasharray="4 4" label={compact ? undefined : { value: '透支线', position: 'insideBottomLeft', fontSize: 10, fill: 'var(--c-warning)' }} />
          <ReferenceLine x={todayLabel} stroke="var(--c-text-muted)" strokeDasharray="3 3" label={compact ? undefined : { value: '今天', position: 'insideTopRight', fontSize: 10, fill: 'var(--c-text-muted)' }} />
          <Area type="monotone" dataKey="past" name="已过去" stroke="var(--c-accent)" strokeWidth={2.5} fill="url(#grad-cash)" dot={false} connectNulls />
          <Line type="monotone" dataKey="future" name="预测" stroke="var(--c-accent)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function CashFlowTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  const events = pt?.events ?? [];
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
