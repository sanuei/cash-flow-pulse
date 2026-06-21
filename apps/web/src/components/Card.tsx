import { ReactNode } from 'react';

/**
 * 通用卡片容器（Notion 风格：耳语边框 + 多层极淡阴影）
 */
export function Card({
  children,
  className = '',
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between mb-3">
          {title && <h2 className="text-base font-bold text-notion-text">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}