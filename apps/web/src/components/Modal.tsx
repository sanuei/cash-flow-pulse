import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

/**
 * Modal — 模态框（v2 升级）
 *
 * 升级点：
 *   1) 背景遮罩从 bg-black/30 → bg-black/35，焦点更稳
 *   2) 入场动画：背景 fade-in，面板 scale-in（80% 起手，ease-out-expo）
 *   3) 关闭按钮从 × 文本改为 SVG X 图标，hover 旋转 90°（160ms）
 *   4) ESC 关闭保持；新增：点击遮罩关闭（已有）
 *   5) 锁定 body 滚动保持
 */
export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** 标题前的图标贴片（给编辑弹窗提供类目上下文） */
  icon?: IconName;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 anim-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="
          bg-[var(--c-bg-elev)] rounded-[var(--radius-xl)] shadow-[var(--shadow-xl)]
          max-w-md w-full max-h-[90vh] overflow-auto
          anim-scale-in border border-[var(--c-border)]
        "
      >
        {title && (
          <header className="sticky top-0 z-10 bg-[var(--c-bg-elev)] px-6 py-4 border-b border-[var(--c-border)] flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold tracking-tight-section text-notion-text flex items-center gap-2.5 min-w-0">
              {icon && (
                <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] bg-[var(--c-accent-soft)]">
                  <Icon name={icon} size={16} className="text-[var(--c-accent-text)]" strokeWidth={1.75} />
                </span>
              )}
              <span className="truncate">{title}</span>
            </h3>
            <button
              onClick={onClose}
              className="
                p-1.5 -m-1.5 rounded-[var(--radius-sm)]
                text-[var(--c-text-muted)] hover:text-[var(--c-text)]
                hover:bg-[var(--c-bg-alt)]
                transition-all duration-[var(--dur-fast)] ease-[var(--ease-out-expo)]
                hover:rotate-90
              "
              aria-label="关闭"
            >
              <Icon name="close" size={16} strokeWidth={1.75} />
            </button>
          </header>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
