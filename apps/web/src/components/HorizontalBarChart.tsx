/**
 * HorizontalBarChart — 横向条形图（比大小）
 *
 * 用于本期支出 / 收入明细的概览、趋势页的支出结构：
 *   - 每行一条：[图标 名称] [条形] [金额 · 占比]，名称/条形/金额在同一行，一眼对比长短
 *   - 按金额从大到小排序；条长按「最大项 = 满格」缩放（不是按总额），差异更明显
 *   - 颜色表示语义而非序号：消费=warning、投资=invest、收入=success，由调用方传入
 *   - 无灰色底轨：底轨会让每行看起来像「完成度进度条」，而这里比的是项与项之间的大小
 *
 * Props:
 *   items: [{ name, amount, color, icon? }]
 *   total: 总额（算占比）
 *   emptyText: 数据为空时显示
 */

import { Icon, type IconName } from './Icon';
import { formatYen } from '@cfp/shared';

export type BarItem = {
  name: string;
  amount: number;
  color: string;
  icon?: IconName;
};

export function HorizontalBarChart({
  items,
  total,
  emptyText = '暂无数据',
}: {
  items: BarItem[];
  total: number;
  emptyText?: string;
}) {
  // 过滤 0 金额项，按金额降序
  const visible = items.filter((it) => it.amount > 0).sort((a, b) => b.amount - a.amount);

  if (visible.length === 0) {
    return (
      <div className="text-center text-notion-text-muted text-[12px] py-6">
        {emptyText}
      </div>
    );
  }

  const max = visible[0]!.amount;
  const pctText = (amount: number) => {
    if (total <= 0) return '';
    const p = (amount / total) * 100;
    return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
  };

  return (
    <ul className="space-y-2.5">
      {visible.map((it) => {
        const width = Math.max(1.5, (it.amount / max) * 100);
        return (
          <li
            key={it.name}
            className="grid items-center gap-x-3 text-[13px]"
            style={{ gridTemplateColumns: 'minmax(0, 7.25rem) minmax(0, 1fr) auto' }}
          >
            {/* 名称 */}
            <span className="flex items-center gap-1.5 min-w-0">
              {it.icon && (
                <Icon name={it.icon} size={13} strokeWidth={1.75} className="flex-shrink-0 text-notion-text-muted" />
              )}
              <span className="text-notion-text-secondary truncate" title={it.name}>{it.name}</span>
            </span>

            {/* 条形：左端贴基线、右端 4px 圆角 */}
            <span className="h-2 flex items-center" aria-hidden="true">
              <span
                className="h-full rounded-r-[4px] transition-[width] duration-[var(--dur-medium)] ease-[var(--ease-out-expo)]"
                style={{ width: `${width}%`, background: it.color }}
              />
            </span>

            {/* 金额 · 占比 */}
            <span className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
              <span className="font-numeric tabular-nums text-notion-text">{formatYen(it.amount)}</span>
              {total > 0 && (
                <span className="font-numeric tabular-nums text-[11px] text-notion-text-muted w-8 text-right">
                  {pctText(it.amount)}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
