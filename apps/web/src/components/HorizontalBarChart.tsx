/**
 * HorizontalBarChart — 水平条形图（v1.4 新增）
 *
 * 用于本期支出 / 收入明细的"概览"模式（收起状态）：
 *   - 每行: [icon 名称] [条形图(按比例)] [金额 + %]
 *   - 颜色映射: 主题色 var(--c-warning) / var(--c-accent) / var(--c-success) / var(--c-text-muted)
 *   - 纯 SVG 实现,0 依赖,无动画(可加 framer-motion 升级)
 *
 * Props:
 *   items: [{ name, amount, color, icon? }]
 *   total: 总额(用于算百分比)
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
  // 过滤 0 金额项(避免显示 0% 条)
  const visible = items.filter((it) => it.amount > 0);

  if (visible.length === 0) {
    return (
      <div className="text-center text-notion-text-muted text-[12px] py-6">
        {emptyText}
      </div>
    );
  }

  return (
    <ul className="space-y-3.5">
      {visible.map((it) => {
        const pct = total > 0 ? (it.amount / total) * 100 : 0;
        return (
          <li key={it.name} className="space-y-1.5">
            {/* 第 1 行: 图标 + 名称 + 金额 + % */}
            <div className="flex items-center gap-2 text-[13px]">
              {it.icon && (
                <span className="flex-shrink-0 w-5 h-5 inline-flex items-center justify-center rounded-[var(--radius-xs)] bg-[var(--c-bg-alt)] text-notion-text-secondary">
                  <Icon name={it.icon} size={12} strokeWidth={1.75} />
                </span>
              )}
              <span className="font-medium text-notion-text truncate">{it.name}</span>
              <span className="font-numeric tabular-nums text-notion-text-secondary ml-auto text-[12px]">
                {formatYen(it.amount)}
              </span>
              <span
                className="font-numeric tabular-nums text-[11px] font-semibold text-notion-text-muted w-10 text-right"
                aria-label={`占比 ${Math.round(pct)}%`}
              >
                {Math.round(pct)}%
              </span>
            </div>
            {/* 第 2 行: 条形 */}
            <div className="h-1.5 bg-[var(--c-bg-alt)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-[var(--dur-medium)] ease-[var(--ease-out-expo)]"
                style={{
                  width: `${pct}%`,
                  background: it.color,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
