import { ReactNode } from 'react';

export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-5xl mb-3">{icon}</div>
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