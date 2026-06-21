import { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * 通用空状态组件
 *
 * 大图标套浅色圆形背景（Notion 风格），下方接标题 + 描述 + 操作。
 *
 * 用法：
 *   <EmptyState
 *     icon="cash"
 *     title="还没有现金来源"
 *     description="添加 PayPay、钱包现金、银行活期等"
 *     action={<button>...</button>}
 *   />
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
    <div className="text-center py-12 px-4">
      <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-notion-bg-alt">
        <Icon name={icon} size={28} className="text-notion-text-muted" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-bold text-notion-text mb-1">{title}</h3>
      {description && <p className="text-sm text-notion-text-secondary mb-4">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ message = '加载中...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-notion-text-secondary text-sm">
      <div className="inline-block w-4 h-4 mr-2 border-2 border-notion-text-muted border-t-transparent rounded-full animate-spin" />
      {message}
    </div>
  );
}