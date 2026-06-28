import { ReactNode, forwardRef } from 'react';

/**
 * Card — 通用卡片容器（v3 升级）
 *
 * 升级点：
 *   1) 圆角 --radius-xl (20px) + 暖橙调阴影（.card 类在 index.css）
 *   2) 标题区更舒展（pb 间距），可选 divided：标题下方整宽分隔线（列表卡用）
 *   3) cardHover：hover 时轻微上浮 + 阴影加深
 */
export const Card = forwardRef<HTMLElement, {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
  cardHover?: boolean;
  /** 标题下方加一条整宽分隔线（列表卡推荐开启） */
  divided?: boolean;
}>(function Card(
  { children, className = '', title, action, cardHover = false, divided = false },
  ref,
) {
  return (
    <section
      ref={ref}
      className={`
        card p-5
        ${cardHover ? 'card-hover hover:-translate-y-0.5' : ''}
        ${className}
      `}
    >
      {(title || action) && (
        <header
          className={`flex items-center justify-between gap-3 ${
            divided
              ? '-mx-5 px-5 pb-3.5 mb-4 border-b border-[var(--c-border)]'
              : 'mb-3.5'
          }`}
        >
          {title && (
            <h2 className="text-[15px] font-semibold tracking-tight-section text-notion-text">
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
});
