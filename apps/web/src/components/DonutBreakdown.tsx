/**
 * DonutBreakdown — 构成环形图（部分占整体）
 *
 * 用于总览页「本期收入去向 / 本期支出明细 / 本期收入明细」三张卡：
 *   - 左：环形图，中心写总额；悬停某段（或右侧图例行）时中心改为该项的名称/金额/占比
 *   - 右：图例，每项都直接标注 [色块 名称 金额 占比]，按金额从大到小
 *
 * 几何上刻意不画任何"环外标签"——旧版环形图的段外百分比会被 viewBox 裁掉，
 * 这里所有文字都在 HTML 里（中心读数用绝对定位叠在 SVG 上），永不溢出。
 *
 * 颜色由调用方按"实体"固定传入（cat-* token），环上顺序 = items 传入顺序，
 * 这样相邻色对就是校验过的那一组；图例单独按金额排序，靠色块对应。
 */
import { useState, type ReactNode } from 'react';
import { formatYen } from '@cfp/shared';

export type DonutItem = {
  key: string;
  name: string;
  amount: number;
  color: string;
  /** 金额前缀，如 '+' / '−'；不传则不加 */
  sign?: string;
  /** 强调该项金额（如「结余」用 success 色） */
  emphasis?: boolean;
};

const SIZE = 136;            // px
const VB = 100;              // viewBox
const R_OUT = 49;
const R_IN = 35;             // 环宽 14：比实心饼轻，中心留得下总额
const GAP_PX = 2;            // 段间 2px 卡面色缝隙

function arcPath(sa: number, ea: number): string {
  const c = VB / 2;
  const large = ea - sa > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
  return [
    `M${p(R_OUT, sa)}`,
    `A${R_OUT},${R_OUT},0,${large},1,${p(R_OUT, ea)}`,
    `L${p(R_IN, ea)}`,
    `A${R_IN},${R_IN},0,${large},0,${p(R_IN, sa)}`,
    'Z',
  ].join(' ');
}

export function DonutBreakdown({
  items,
  centerLabel,
  emptyText = '暂无数据',
  footer,
}: {
  items: DonutItem[];
  centerLabel: string;
  emptyText?: string;
  footer?: ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  const visible = items.filter((it) => it.amount > 0);
  const total = visible.reduce((s, it) => s + it.amount, 0);

  if (total <= 0) {
    return <div className="text-center text-notion-text-muted text-[12px] py-6">{emptyText}</div>;
  }

  const pctOf = (v: number) => (v / total) * 100;
  const pctText = (v: number) => {
    const p = pctOf(v);
    return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
  };

  // 环上各段：按传入顺序；极小的段给一个最小可见弧度
  const gap = visible.length > 1 ? (GAP_PX / SIZE) * VB / ((R_OUT + R_IN) / 2) : 0;
  const minSweep = 0.03;
  let angle = -Math.PI / 2;
  const arcs = visible.map((it) => {
    const sweep = Math.max(minSweep, (it.amount / total) * Math.PI * 2);
    const sa = angle + gap / 2;
    const ea = angle + sweep - gap / 2;
    angle += sweep;
    return { it, d: arcPath(sa, Math.max(sa + 0.001, ea)) };
  });

  const activeItem = active ? visible.find((it) => it.key === active) : undefined;
  const legend = [...visible].sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-5">
        {/* 环形图 + 中心读数 */}
        <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${VB} ${VB}`}
            role="img"
            aria-label={visible.map((it) => `${it.name} ${pctText(it.amount)}`).join('，')}
            onMouseLeave={() => setActive(null)}
          >
            {visible.length === 1 ? (
              <circle
                cx={VB / 2} cy={VB / 2} r={(R_OUT + R_IN) / 2}
                fill="none" stroke={visible[0]!.color} strokeWidth={R_OUT - R_IN}
              />
            ) : (
              arcs.map(({ it, d }) => (
                <path
                  key={it.key}
                  d={d}
                  fill={it.color}
                  className="cursor-default transition-opacity duration-[var(--dur-fast)]"
                  style={{ opacity: active && active !== it.key ? 0.3 : 1 }}
                  onMouseEnter={() => setActive(it.key)}
                >
                  <title>{`${it.name} ${formatYen(it.amount)}（${pctText(it.amount)}）`}</title>
                </path>
              ))
            )}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div className="text-[11px] text-notion-text-muted leading-tight truncate max-w-full">
              {activeItem ? activeItem.name : centerLabel}
            </div>
            <div
              className={`font-display font-semibold leading-tight mt-0.5 ${
                formatYen(activeItem?.amount ?? total).length > 9 ? 'text-[13px]' : 'text-[15px]'
              } text-notion-text`}
            >
              {formatYen(activeItem?.amount ?? total)}
            </div>
            {activeItem && (
              <div className="text-[11px] text-notion-text-muted font-numeric leading-tight mt-0.5">
                {pctText(activeItem.amount)}
              </div>
            )}
          </div>
        </div>

        {/* 图例：直接标注，悬停联动环上对应段 */}
        <ul className="flex-1 min-w-0 space-y-0.5">
          {legend.map((it) => (
            <li
              key={it.key}
              onMouseEnter={() => setActive(it.key)}
              onMouseLeave={() => setActive(null)}
              className={`flex items-center gap-2 text-[13px] py-1.5 px-1.5 -mx-1.5 rounded-[var(--radius-sm)] transition-colors ${
                active === it.key ? 'bg-[var(--c-bg-alt)]' : ''
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: it.color }} aria-hidden="true" />
              <span className="text-notion-text-secondary truncate min-w-0" title={it.name}>{it.name}</span>
              <span
                className={`font-numeric tabular-nums ml-auto whitespace-nowrap ${
                  it.emphasis ? 'text-notion-success font-semibold' : 'text-notion-text'
                }`}
              >
                {it.sign ?? ''}{formatYen(it.amount)}
              </span>
              <span className="w-9 text-right flex-shrink-0 font-numeric tabular-nums text-[12px] text-notion-text-muted">
                {pctText(it.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {footer}
    </div>
  );
}
