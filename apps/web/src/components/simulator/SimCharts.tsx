/**
 * 财富模拟器的两张图：
 *   - AssetTrajectoryChart：资产主曲线（当前方案 + 「你现在的路线」参照线 + 目标线，可切三情景区间带），
 *     标注财务自由点、退休线、资产耗尽点、大事件
 *   - PrincipalGainsChart：本金 vs 复利收益（堆叠面积）
 * x 轴是年龄（数值轴），金额默认按今天的购买力；nominal 时 × (1+通胀)^年数。
 */
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceDot,
} from 'recharts';
import type { SimInput, SimResult, SimEvent } from '@cfp/shared';
import { yenCompact } from '../../lib/simulator';

/** 「1.5亿」「3000万」——比 M/k 更符合中文读数习惯 */
export function yenAxisTickCn(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, '')}亿`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4)}万`;
  return `${Math.round(v)}`;
}

/** 第 t 年（从现在起）的名义系数 */
export function nominalFactor(input: SimInput, nominal: boolean, years: number): number {
  return nominal ? Math.pow(1 + input.inflationPct / 100, years) : 1;
}

/** 年度行 → 图上的点（第一个点 = 现在） */
function points(input: SimInput, r: SimResult) {
  const out = [{ t: 0, age: input.startAge, total: r.rows[0]?.startTotal ?? input.cash + input.invested, principal: input.cash + input.invested, gains: 0 }];
  for (const row of r.rows) {
    const t = Math.min(r.months, (row.year + 1) * 12) / 12;
    out.push({ t, age: input.startAge + t, total: row.endTotal, principal: row.principal, gains: row.gains });
  }
  return out;
}

const AXIS = { fontSize: 11, fill: 'var(--c-text-muted)' };

export type TrajectoryMode = 'single' | 'scenarios';

export function AssetTrajectoryChart({
  input, result, baseline, scenarios, mode, nominal, showBaseline, events,
}: {
  input: SimInput;
  result: SimResult;
  baseline: SimResult;
  scenarios: { pessimistic: SimResult; optimistic: SimResult };
  mode: TrajectoryMode;
  nominal: boolean;
  /** 方案和现在的路线不同时才画参照线 */
  showBaseline: boolean;
  events: SimEvent[];
}) {
  const f = (t: number) => nominalFactor(input, nominal, t);
  const cur = points(input, result);
  const base = points(input, baseline);
  const pess = points(input, scenarios.pessimistic);
  const opt = points(input, scenarios.optimistic);
  const data = cur.map((p, i) => ({
    age: Math.round(p.age * 100) / 100,
    t: p.t,
    cur: p.total * f(p.t),
    base: showBaseline && base[i] ? base[i]!.total * f(p.t) : null,
    band: mode === 'scenarios' && pess[i] && opt[i] ? [pess[i]!.total * f(p.t), opt[i]!.total * f(p.t)] : null,
    pess: pess[i] ? pess[i]!.total * f(p.t) : null,
    opt: opt[i] ? opt[i]!.total * f(p.t) : null,
    target: result.target * f(p.t),
  }));
  const endAge = data[data.length - 1]!.age;
  const fireT = result.fireAge !== null ? result.fireAge - input.startAge : null;
  const fixedRetire = input.retireAge !== null && result.retireAge !== null && result.retireAge !== result.fireAge;

  return (
    <div>
      <ChartLegend
        items={[
          { label: '当前方案', color: 'var(--c-accent)', kind: 'line' },
          ...(showBaseline ? [{ label: '你现在的路线', color: 'var(--c-invest)', kind: 'dash' as const }] : []),
          ...(mode === 'scenarios' ? [{ label: '悲观 ~ 乐观（收益 ±2%）', color: 'var(--c-accent)', kind: 'band' as const }] : []),
          { label: '财务自由目标', color: 'var(--c-text-secondary)', kind: 'dot' },
        ]}
      />
      <div className="h-72 sm:h-96 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="sim-grad-cur" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--c-accent)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--c-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--c-border)" />
            <XAxis
              dataKey="age" type="number" domain={[input.startAge, endAge]}
              tickFormatter={(v: number) => `${Math.round(v)}岁`} tickCount={8} allowDecimals={false}
              tick={AXIS} tickLine={false} axisLine={false} tickMargin={10}
            />
            <YAxis tick={AXIS} tickFormatter={yenAxisTickCn} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              content={<TrajectoryTooltip mode={mode} showBaseline={showBaseline} startYear={new Date().getFullYear()} />}
              cursor={{ stroke: 'var(--c-border-strong)', strokeWidth: 1 }}
            />
            {mode === 'scenarios' && (
              <Area type="monotone" dataKey="band" stroke="none" fill="var(--c-accent)" fillOpacity={0.13} isAnimationActive={false} activeDot={false} />
            )}
            <Line type="monotone" dataKey="target" stroke="var(--c-text-secondary)" strokeWidth={1.5} strokeDasharray="2 4" dot={false} activeDot={false} isAnimationActive={false} />
            {showBaseline && (
              <Line type="monotone" dataKey="base" stroke="var(--c-invest)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />
            )}
            <Area type="monotone" dataKey="cur" stroke="var(--c-accent)" strokeWidth={2.5} fill="url(#sim-grad-cur)" dot={false} isAnimationActive={false} />
            <ReferenceLine y={0} stroke="var(--c-border-strong)" />

            {/* 大事件：竖向虚线 + 名称（太多时只画线） */}
            {events.filter((e) => e.age >= input.startAge && e.age <= endAge && e.amount > 0).map((e, i, arr) => (
              <ReferenceLine
                key={e.id}
                x={e.age}
                stroke="var(--c-text-muted)"
                strokeDasharray="2 3"
                label={arr.length <= 4 ? { value: e.name || '大事件', position: i % 2 ? 'insideBottomLeft' : 'insideTopLeft', fontSize: 10, fill: 'var(--c-text-muted)' } : undefined}
              />
            ))}
            {fixedRetire && (
              <ReferenceLine
                x={result.retireAge!}
                stroke="var(--c-text-secondary)"
                strokeDasharray="4 4"
                label={{ value: `${Math.floor(result.retireAge!)}岁退休`, position: 'insideTopRight', fontSize: 10, fill: 'var(--c-text-secondary)' }}
              />
            )}
            {fireT !== null && (
              <ReferenceDot
                x={result.fireAge!}
                y={result.target * nominalFactor(input, nominal, fireT)}
                r={5}
                fill="var(--c-accent)"
                stroke="var(--c-bg-elev)"
                strokeWidth={2}
                label={{ value: `财务自由 · ${Math.floor(result.fireAge!)}岁`, position: 'top', fontSize: 11, fontWeight: 600, fill: 'var(--c-accent-text)' }}
              />
            )}
            {result.depletedAge !== null && (
              <ReferenceDot
                x={result.depletedAge}
                y={0}
                r={5}
                fill="var(--c-warning)"
                stroke="var(--c-bg-elev)"
                strokeWidth={2}
                label={{ value: `${Math.floor(result.depletedAge)}岁耗尽`, position: 'top', fontSize: 11, fontWeight: 600, fill: 'var(--c-warning)' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TrajectoryTooltip({ active, payload, mode, showBaseline, startYear }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const rows: { label: string; value: number | null; color: string; strong?: boolean }[] = [
    { label: '当前方案', value: p.cur, color: 'var(--c-accent)', strong: true },
    ...(showBaseline ? [{ label: '现在的路线', value: p.base, color: 'var(--c-invest)' }] : []),
    ...(mode === 'scenarios' ? [
      { label: '乐观', value: p.opt, color: 'var(--c-text-muted)' },
      { label: '悲观', value: p.pess, color: 'var(--c-text-muted)' },
    ] : []),
    { label: '目标', value: p.target, color: 'var(--c-text-secondary)' },
  ];
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--c-border)] bg-[var(--c-bg-elev)] shadow-[var(--shadow-lg)] px-3 py-2.5 min-w-[170px]">
      <div className="text-[11px] text-notion-text-muted mb-1.5">
        {Math.floor(p.age)} 岁 · {startYear + Math.round(p.t)} 年
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-[12px]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} aria-hidden="true" />
            <span className="text-notion-text-secondary">{r.label}</span>
            <span className={`font-numeric tabular-nums ml-auto ${r.strong ? 'font-semibold text-notion-text' : 'text-notion-text-secondary'}`}>
              {r.value == null ? '—' : yenCompact(r.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrincipalGainsChart({ input, result, nominal }: { input: SimInput; result: SimResult; nominal: boolean }) {
  const data = points(input, result).map((p) => {
    const k = nominalFactor(input, nominal, p.t);
    return {
      age: Math.round(p.age * 100) / 100,
      t: p.t,
      principal: Math.max(0, p.principal) * k,
      gains: Math.max(0, p.gains) * k,
    };
  });
  const cross = data.find((d) => d.t > 0 && d.gains > d.principal && d.principal > 0);
  const endAge = data[data.length - 1]!.age;

  return (
    <div>
      <ChartLegend
        items={[
          { label: '本金（现金 + 投入的钱）', color: 'var(--c-cat-blue)', kind: 'block' },
          { label: '复利收益', color: 'var(--c-cat-aqua)', kind: 'block' },
        ]}
      />
      <div className="h-56 sm:h-64 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--c-border)" />
            <XAxis
              dataKey="age" type="number" domain={[input.startAge, endAge]}
              tickFormatter={(v: number) => `${Math.round(v)}岁`} tickCount={8} allowDecimals={false}
              tick={AXIS} tickLine={false} axisLine={false} tickMargin={10}
            />
            <YAxis tick={AXIS} tickFormatter={yenAxisTickCn} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<PrincipalTooltip startYear={new Date().getFullYear()} />} cursor={{ stroke: 'var(--c-border-strong)', strokeWidth: 1 }} />
            <Area type="monotone" dataKey="principal" stackId="a" stroke="var(--c-cat-blue)" strokeWidth={1.5} fill="var(--c-cat-blue)" fillOpacity={0.55} isAnimationActive={false} />
            <Area type="monotone" dataKey="gains" stackId="a" stroke="var(--c-cat-aqua)" strokeWidth={1.5} fill="var(--c-cat-aqua)" fillOpacity={0.55} isAnimationActive={false} />
            {cross && (
              <ReferenceLine
                x={cross.age}
                stroke="var(--c-text-secondary)"
                strokeDasharray="3 3"
                label={{ value: `${Math.floor(cross.age)}岁起收益超过本金`, position: 'insideTopLeft', fontSize: 10, fill: 'var(--c-text-secondary)' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PrincipalTooltip({ active, payload, startYear }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const total = p.principal + p.gains;
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--c-border)] bg-[var(--c-bg-elev)] shadow-[var(--shadow-lg)] px-3 py-2.5 min-w-[170px]">
      <div className="text-[11px] text-notion-text-muted mb-1.5">{Math.floor(p.age)} 岁 · {startYear + Math.round(p.t)} 年</div>
      {[
        { label: '本金', v: p.principal, c: 'var(--c-cat-blue)' },
        { label: '复利收益', v: p.gains, c: 'var(--c-cat-aqua)' },
      ].map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-[12px]">
          <span className="w-2 h-2 rounded-[2px]" style={{ background: r.c }} aria-hidden="true" />
          <span className="text-notion-text-secondary">{r.label}</span>
          <span className="font-numeric tabular-nums ml-auto text-notion-text">{yenCompact(r.v)}</span>
          <span className="w-9 text-right font-numeric text-[11px] text-notion-text-muted">{total > 0 ? `${Math.round((r.v / total) * 100)}%` : ''}</span>
        </div>
      ))}
    </div>
  );
}

function ChartLegend({ items }: { items: { label: string; color: string; kind: 'line' | 'dash' | 'band' | 'dot' | 'block' }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-2 text-[12px] text-notion-text-secondary">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.kind === 'line' && <span className="w-4 h-[3px] rounded-full" style={{ background: it.color }} />}
          {it.kind === 'dash' && <span className="w-4 border-t-2 border-dashed" style={{ borderColor: it.color }} />}
          {it.kind === 'dot' && <span className="w-4 border-t-2 border-dotted" style={{ borderColor: it.color }} />}
          {it.kind === 'band' && <span className="w-4 h-2.5 rounded-[2px]" style={{ background: it.color, opacity: 0.25 }} />}
          {it.kind === 'block' && <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}
