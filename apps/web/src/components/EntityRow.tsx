import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * 通用列表行：左侧主/副文案，中间金额，右侧编辑/删除按钮。
 *
 * 现金 / 信用卡 / 投资 / 账单 / 收入 / 订阅 六类列表共用这一行布局，
 * 各类只需传入 title / subtitle / money 三块 ReactNode。
 */
export function EntityRow({
  title,
  subtitle,
  money,
  onEdit,
  onDelete,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  money: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-notion-bg-alt/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-notion-text truncate">{title}</div>
        <div className="text-xs text-notion-text-muted mt-0.5">{subtitle}</div>
      </div>
      <div className="text-right">{money}</div>
      <div className="flex gap-0.5">
        <button
          onClick={onEdit}
          className="text-notion-text-muted hover:text-notion-blue p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
          aria-label="编辑"
        >
          <Icon name="edit" size={14} />
        </button>
        <button
          onClick={onDelete}
          className="text-notion-text-muted hover:text-notion-warning p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
          aria-label="删除"
        >
          <Icon name="close" size={14} strokeWidth={2} />
        </button>
      </div>
    </li>
  );
}
