import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * EntityRow — 通用列表行（v3 升级）
 *
 * 升级点：
 *   1) 可选前导图标贴片（leading icon tile）— 参考图风格，列表更"产品化"
 *   2) 整行 hover：背景柔和 + 左侧墨色 indicator 滑入
 *   3) 编辑/删除按钮 hover 微动（旋转 / 上抬），触屏常驻可见
 *   4) 行距更舒展，金额右对齐强调
 */
export function EntityRow({
  title,
  subtitle,
  money,
  icon,
  tone = 'neutral',
  onEdit,
  onDelete,
  leaving = false,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  money: ReactNode;
  /** 前导图标（不传则不显示贴片） */
  icon?: IconName;
  /** 贴片配色 */
  tone?: 'neutral' | 'accent' | 'success' | 'warning';
  onEdit: () => void;
  onDelete: () => void;
  /** 乐观删除时设为 true，触发离场动画 */
  leaving?: boolean;
}) {
  const toneClass = {
    neutral: 'bg-[var(--c-bg-alt)] text-[var(--c-text-secondary)]',
    accent: 'bg-[var(--c-accent-soft)] text-[var(--c-accent-text)]',
    success: 'bg-[var(--c-success-soft)] text-[var(--c-success)]',
    warning: 'bg-[var(--c-warning-soft)] text-[var(--c-warning)]',
  }[tone];

  return (
    <li
      className={`
        group relative flex items-center gap-3 px-5 py-3.5
        transition-all duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
        hover:bg-[var(--c-bg-alt)]
        ${leaving ? 'opacity-0 -translate-x-2' : 'opacity-100'}
      `}
    >
      {/* 左侧 indicator — hover 时滑入 */}
      <span
        className="
          absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px]
          bg-[var(--c-accent)] rounded-r-full
          origin-left scale-x-0 group-hover:scale-x-100
          transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
        "
        aria-hidden="true"
      />

      {/* 前导图标贴片 */}
      {icon && (
        <span
          className={`
            flex-shrink-0 flex items-center justify-center w-9 h-9
            rounded-[var(--radius-md)] ${toneClass}
            transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
            group-hover:scale-105
          `}
        >
          <Icon name={icon} size={16} strokeWidth={1.75} />
        </span>
      )}

      <div className="flex-1 min-w-0">
        <div className="font-medium text-[14px] text-notion-text truncate leading-snug">
          {title}
        </div>
        <div className="text-[12px] text-notion-text-muted mt-0.5 truncate">{subtitle}</div>
      </div>
      <div className="text-right shrink-0">{money}</div>
      <div className="flex gap-0.5 shrink-0">
        <button
          onClick={onEdit}
          className="
            p-1.5 rounded-[var(--radius-sm)]
            text-[var(--c-text-muted)] hover:text-[var(--c-accent)]
            hover:bg-[var(--c-bg-elev)]
            transition-all duration-[var(--dur-fast)] ease-[var(--ease-out-expo)]
            hover:rotate-12
          "
          aria-label="编辑"
        >
          <Icon name="edit" size={14} strokeWidth={1.75} />
        </button>
        <button
          onClick={onDelete}
          className="
            p-1.5 rounded-[var(--radius-sm)]
            text-[var(--c-text-muted)] hover:text-[var(--c-warning)]
            hover:bg-[var(--c-bg-elev)]
            transition-all duration-[var(--dur-fast)] ease-[var(--ease-out-expo)]
            hover:-translate-y-px
          "
          aria-label="删除"
        >
          <Icon name="close" size={14} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}
