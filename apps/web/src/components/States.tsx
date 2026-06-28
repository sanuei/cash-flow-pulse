import { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * EmptyState — 空状态（v2 升级）
 *
 * 升级点：
 *   1) 圆形背景从纯灰 bg-alt 改为带一点暖色
 *   2) 标题加 serif display（更"编辑感"）
 *   3) 描述字号从 14 → 13，跟正文区分开
 */
export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-10 px-4 anim-fade-in">
      <div className="inline-flex items-center justify-center w-14 h-14 mb-3 rounded-full bg-[var(--c-bg-alt)] border border-[var(--c-border)]">
        <Icon name={icon} size={24} className="text-notion-text-muted" strokeWidth={1.5} />
      </div>
      <h3 className="text-[15px] font-semibold text-notion-text mb-1 tracking-tight-section">
        {title}
      </h3>
      {description && (
        <p className="text-[13px] text-notion-text-secondary mb-4 max-w-[28ch] mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

export function LoadingState({ message = '加载中...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-notion-text-secondary text-[13px] anim-fade-in">
      <div className="inline-block w-3.5 h-3.5 mr-2 border-[1.5px] border-[var(--c-border-strong)] border-t-[var(--c-accent)] rounded-full animate-spin" />
      {message}
    </div>
  );
}

/**
 * Skeleton — 骨架屏（v2 新增）
 * 用于 Trends 图表加载 / 列表占位。
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}
