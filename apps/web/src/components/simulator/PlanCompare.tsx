/**
 * 方案对比：最多 3 个方案 + 灰色的「你现在的路线」并排比较。
 *   - 资产轨迹叠加（固定收益路线，标出各自的财务自由点）
 *   - 对比表：结果（财务自由、成功率、停止工作、耗尽/剩余、峰值、目标）+ 关键参数；每行最好的一格标「最好」
 * 颜色跟着方案走（占用的槽位决定颜色，取消别的方案不会让它变色）；3 色在深浅主题下都通过了色盲校验，
 * 所以最多对比 3 个，第 4 个不再生成新颜色。
 */
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot,
} from 'recharts';
import {
  simulate, simInputFor, MAX_COMPARE, formatYen,
  type SimBaseline, type SimulatorPlans, type SimulatorSettings, type SimInput, type SimResult, type MonteCarloResult,
} from '@cfp/shared';
import { Card } from '../Card';
import { yenCompact, formatMonths, yearAfterMonths } from '../../lib/simulator';
import { useMonteCarloMany } from '../../lib/useSimWorker';
import { yenAxisTickCn } from './SimCharts';
import { pctText } from './SimHeatmap';

const SLOT_COLORS = ['var(--c-cat-blue)', 'var(--c-cat-orange)', 'var(--c-cat-aqua)'];
const BASE_COLOR = 'var(--c-text-muted)';
const DRAFT = '__draft';
const BASE = '__base';

type Entry = { key: string; name: string; settings: SimulatorSettings; color: string; isBase?: boolean };
type Computed = Entry & { input: SimInput; result: SimResult; mc: MonteCarloResult | null };

export function PlanCompare({
  baseline, state, onOpen,
}: {
  baseline: SimBaseline;
  state: SimulatorPlans;
  /** 打开某个方案继续编辑（草稿 = null） */
  onOpen: (id: string | null) => void;
}) {
  const candidates = useMemo(() => {
    const list: { key: string; name: string; settings: SimulatorSettings }[] = [];
    if (Object.keys(state.draft).length > 0) list.push({ key: DRAFT, name: '草稿', settings: state.draft });
    for (const p of state.plans) list.push({ key: p.id, name: p.name, settings: p.settings });
    return list;
  }, [state]);

  // 槽位：颜色 = 槽位序号；默认先放正在编辑的方案，再按顺序填满
  const [slots, setSlots] = useState<(string | null)[]>(() => {
    const activeKey = state.active_id ?? (Object.keys(state.draft).length ? DRAFT : null);
    const order = [
      ...(activeKey ? [activeKey] : []),
      ...candidates.map((c) => c.key).filter((k) => k !== activeKey),
    ];
    return Array.from({ length: MAX_COMPARE }, (_, i) => order[i] ?? null);
  });
  const [hint, setHint] = useState(false);
  const liveSlots = slots.map((k) => (k && candidates.some((c) => c.key === k) ? k : null));

  const toggle = (key: string) => {
    const at = liveSlots.indexOf(key);
    if (at >= 0) {
      setSlots(liveSlots.map((k, i) => (i === at ? null : k)));
      setHint(false);
      return;
    }
    const free = liveSlots.indexOf(null);
    if (free < 0) { setHint(true); return; }
    setSlots(liveSlots.map((k, i) => (i === free ? key : k)));
  };

  const entries: Entry[] = [
    { key: BASE, name: '你现在的路线', settings: {}, color: BASE_COLOR, isBase: true },
    ...liveSlots.flatMap((k, i) => {
      const c = k ? candidates.find((x) => x.key === k) : null;
      return c ? [{ ...c, color: SLOT_COLORS[i]! }] : [];
    }),
  ];
  const inputs = useMemo(() => entries.map((e) => simInputFor(baseline, e.settings)), [baseline, JSON.stringify(entries.map((e) => e.settings))]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(() => inputs.map((i) => simulate(i)), [inputs]);
  const mc = useMonteCarloMany(inputs);
  const computed: Computed[] = entries.map((e, i) => ({
    ...e, input: inputs[i]!, result: results[i]!, mc: mc.data?.[i] ?? null,
  }));

  if (candidates.length === 0) {
    return (
      <Card>
        <p className="text-[14px] text-notion-text-secondary leading-relaxed">
          还没有可以对比的方案。在「模拟」里调好参数后点「保存为方案」，可以存多个（比如「继续工作到 60 岁」「45 岁提前退休」「买房」），然后在这里并排比较。
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card title="选择要对比的方案">
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => {
            const slot = liveSlots.indexOf(c.key);
            const on = slot >= 0;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggle(c.key)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-pill)] border text-[13px] font-semibold transition-colors ${
                  on ? 'border-[var(--c-border-strong)] bg-[var(--c-bg-alt)] text-notion-text' : 'border-[var(--c-border)] text-notion-text-secondary hover:text-notion-text'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border"
                  style={on ? { background: SLOT_COLORS[slot], borderColor: SLOT_COLORS[slot] } : { borderColor: 'var(--c-border-strong)' }}
                  aria-hidden="true"
                />
                {c.name}
              </button>
            );
          })}
        </div>
        <p className={`text-[12px] mt-2 ${hint ? 'text-notion-warning' : 'text-notion-text-muted'}`}>
          {hint ? `最多同时对比 ${MAX_COMPARE} 个，先取消一个再选。` : `最多选 ${MAX_COMPARE} 个；灰色虚线是不做任何调整的「你现在的路线」。`}
        </p>
      </Card>

      <Card title="资产轨迹对比">
        <CompareChart computed={computed} />
        <p className="text-[11px] text-notion-text-muted mt-2">按固定收益推算（今天的购买力）；圆点是各方案达到财务自由目标的时间；落在 0 线上的圆点是资产耗尽的时间。</p>
      </Card>

      <Card title="逐项对比">
        <CompareTable computed={computed} onOpen={onOpen} pending={mc.pending} />
      </Card>
    </div>
  );
}

// ── 叠加图 ─────────────────────────────────────────────────────

const AXIS = { fontSize: 11, fill: 'var(--c-text-muted)' };

function CompareChart({ computed }: { computed: Computed[] }) {
  const startAge = computed[0]!.input.startAge;
  const len = Math.max(...computed.map((c) => c.result.rows.length));
  const data = Array.from({ length: len + 1 }, (_, t) => {
    const row: Record<string, number | null> = { age: startAge + t, t };
    for (const c of computed) {
      // 资产耗尽后画在 0（负数是「欠的钱」，模拟里不存在借钱，画出来会误导）
      const v = t === 0 ? c.input.cash + c.input.invested : c.result.rows[t - 1]?.endTotal ?? null;
      row[c.key] = v === null ? null : Math.max(0, v);
    }
    return row;
  });
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-2 text-[12px] text-notion-text-secondary">
        {computed.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1.5">
            {c.isBase
              ? <span className="w-4 border-t-2 border-dashed" style={{ borderColor: c.color }} />
              : <span className="w-4 h-[3px] rounded-full" style={{ background: c.color }} />}
            {c.name}
          </span>
        ))}
      </div>
      <div className="h-72 sm:h-96 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--c-border)" />
            <XAxis
              dataKey="age" type="number" domain={['dataMin', 'dataMax']}
              tickFormatter={(v: number) => `${Math.round(v)}岁`} tickCount={8} allowDecimals={false}
              tick={AXIS} tickLine={false} axisLine={false} tickMargin={10}
            />
            <YAxis tick={AXIS} tickFormatter={yenAxisTickCn} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={<CompareTooltip computed={computed} />} cursor={{ stroke: 'var(--c-border-strong)', strokeWidth: 1 }} />
            {computed.map((c) => (
              <Line
                key={c.key}
                type="monotone"
                dataKey={c.key}
                stroke={c.color}
                strokeWidth={c.isBase ? 1.75 : 2.25}
                strokeDasharray={c.isBase ? '6 4' : undefined}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            {computed.filter((c) => c.result.depletedAge !== null).map((c) => (
              <ReferenceDot key={`dep-${c.key}`} x={c.result.depletedAge!} y={0} r={4} fill={c.color} stroke="var(--c-bg-elev)" strokeWidth={2} />
            ))}
            {computed.filter((c) => c.result.fireAge !== null).map((c) => (
              <ReferenceDot
                key={`fire-${c.key}`}
                x={c.result.fireAge!}
                y={c.result.target}
                r={5}
                fill={c.color}
                stroke="var(--c-bg-elev)"
                strokeWidth={2}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CompareTooltip({ active, payload, computed }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--c-border)] bg-[var(--c-bg-elev)] shadow-[var(--shadow-lg)] px-3 py-2.5 min-w-[180px]">
      <div className="text-[11px] text-notion-text-muted mb-1.5">{Math.floor(p.age)} 岁 · {new Date().getFullYear() + p.t} 年</div>
      <div className="space-y-1">
        {(computed as Computed[]).map((c) => (
          <div key={c.key} className="flex items-center gap-2 text-[12px]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} aria-hidden="true" />
            <span className="text-notion-text-secondary truncate max-w-[120px]">{c.name}</span>
            <span className="font-numeric tabular-nums ml-auto text-notion-text">{p[c.key] == null ? '—' : yenCompact(p[c.key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 对比表 ─────────────────────────────────────────────────────

type TableRow = {
  label: string;
  value: (c: Computed) => string;
  /** 越大越好的分数；null = 不参与比较 */
  score?: (c: Computed) => number | null;
  /** 参数行：和「你现在的路线」不同的值加粗 */
  param?: (c: Computed) => string | number | boolean | null;
};

function CompareTable({ computed, onOpen, pending }: { computed: Computed[]; onOpen: (id: string | null) => void; pending: boolean }) {
  const end = (c: Computed) => Math.round(c.input.lifeExpectancy);
  const results: TableRow[] = [
    {
      label: '财务自由',
      value: (c) => c.result.fireMonth === 0 ? '已达成' : c.result.fireMonth !== null
        ? `${Math.floor(c.result.fireAge!)} 岁（${yearAfterMonths(c.result.fireMonth)}）` : '达不到',
      score: (c) => (c.result.fireMonth === null ? null : -c.result.fireMonth),
    },
    {
      label: '还需',
      value: (c) => c.result.fireMonth === null ? '—' : c.result.fireMonth === 0 ? '0' : formatMonths(c.result.fireMonth),
    },
    {
      label: '成功率',
      value: (c) => (c.mc ? `${pctText(c.mc.successRate)}（到 ${end(c)} 岁）` : pending ? '计算中…' : '—'),
      score: (c) => c.mc?.successRate ?? null,
    },
    {
      label: '停止工作',
      value: (c) => (c.result.retireAge !== null ? `${Math.floor(c.result.retireAge)} 岁` : '—'),
    },
    {
      label: '寿命终点',
      value: (c) => (c.result.depletedAge !== null ? `${Math.floor(c.result.depletedAge)} 岁耗尽` : `剩 ${yenCompact(c.result.endAssets)}`),
      score: (c) => (c.result.depletedAge !== null ? c.result.depletedAge - 1e6 : c.result.endAssets),
    },
    { label: '资产峰值', value: (c) => yenCompact(c.result.peak), score: (c) => c.result.peak },
    { label: '财务自由目标', value: (c) => yenCompact(c.result.target) },
  ];
  const params: TableRow[] = [
    { label: '每月定投', value: (c) => formatYen(c.input.monthlyInvest), param: (c) => c.input.monthlyInvest },
    { label: '退休后月支出', value: (c) => formatYen(c.input.retireSpendMonthly), param: (c) => c.input.retireSpendMonthly },
    { label: '年化收益 / 波动', value: (c) => `${c.input.annualReturnPct}% / ${c.input.volatilityPct}%`, param: (c) => `${c.input.annualReturnPct}/${c.input.volatilityPct}` },
    { label: '提取率', value: (c) => `${c.input.withdrawalRatePct}%`, param: (c) => c.input.withdrawalRatePct },
    { label: '退休方式', value: (c) => (c.input.retireAge !== null ? `${c.input.retireAge} 岁退休` : '达标即退'), param: (c) => c.input.retireAge },
    { label: '月收入', value: (c) => formatYen(c.input.monthlyIncome), param: (c) => c.input.monthlyIncome },
    { label: '养老金', value: (c) => (c.input.pensionMonthly > 0 ? `${formatYen(c.input.pensionMonthly)}/月 · ${c.input.pensionStartAge} 岁起` : '未设置'), param: (c) => `${c.input.pensionMonthly}/${c.input.pensionStartAge}` },
    { label: '大事件', value: (c) => (c.input.events.length ? c.input.events.map((e) => e.name || '未命名').join('、') : '无'), param: (c) => JSON.stringify(c.input.events) },
    { label: '计入房产', value: (c) => (c.settings.includeRealEstate ? '是' : '否'), param: (c) => !!c.settings.includeRealEstate },
  ];

  const best = (row: TableRow): Set<string> => {
    if (!row.score || computed.length < 2) return new Set();
    const scores = computed.map((c) => row.score!(c));
    const valid = scores.filter((v): v is number => v !== null);
    if (valid.length === 0) return new Set();
    const top = Math.max(...valid);
    const winners = computed.filter((_, i) => scores[i] !== null && Math.abs(scores[i]! - top) < 1e-9);
    // 大家一样好就不标
    return winners.length === computed.length ? new Set() : new Set(winners.map((c) => c.key));
  };
  const base = computed[0]!;

  const renderRows = (rows: TableRow[]) => rows.map((row) => {
    const winners = best(row);
    return (
      <tr key={row.label} className="border-t border-[var(--c-border)]">
        <th scope="row" className="text-left font-normal text-notion-text-secondary py-2 pr-3 pl-5 whitespace-nowrap sticky left-0 bg-[var(--c-bg-elev)]">{row.label}</th>
        {computed.map((c) => {
          const changed = row.param && !c.isBase && JSON.stringify(row.param(c)) !== JSON.stringify(row.param(base));
          const win = winners.has(c.key);
          return (
            <td key={c.key} className={`py-2 px-3 text-[13px] font-numeric tabular-nums align-top ${changed || win ? 'text-notion-text font-semibold' : 'text-notion-text-secondary'}`}>
              <span className="whitespace-nowrap">{row.value(c)}</span>
              {win && <span className="badge badge-success !text-[10px] !px-1.5 !py-0.5 ml-1.5 align-middle">最好</span>}
            </td>
          );
        })}
      </tr>
    );
  });

  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full border-collapse min-w-[560px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-[var(--c-bg-elev)]" />
            {computed.map((c) => (
              <th key={c.key} className="text-left px-3 pb-3 align-bottom min-w-[150px]">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-notion-text">
                  {c.isBase
                    ? <span className="w-4 border-t-2 border-dashed flex-shrink-0" style={{ borderColor: c.color }} aria-hidden="true" />
                    : <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} aria-hidden="true" />}
                  <span className="truncate">{c.name}</span>
                </div>
                {!c.isBase && (
                  <button type="button" onClick={() => onOpen(c.key === DRAFT ? null : c.key)} className="text-[12px] font-semibold text-[var(--c-accent-text)] hover:underline mt-0.5">
                    打开编辑
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {renderRows(results)}
          <tr>
            <td colSpan={computed.length + 1} className="pt-5 pb-1 pl-5 text-[11px] font-semibold uppercase tracking-wider text-notion-text-muted">
              关键参数（和「你现在的路线」不同的加粗）
            </td>
          </tr>
          {renderRows(params)}
        </tbody>
      </table>
    </div>
  );
}
