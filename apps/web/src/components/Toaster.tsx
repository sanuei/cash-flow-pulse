import { useToast } from '../lib/toast';
import { Icon } from './Icon';
import { useEffect, useState } from 'react';

/**
 * Toaster — 全局 Toast 容器（v2 升级）
 *
 * 升级点：
 *   1) 从黑底白字 → 深墨底白字（用 --c-text 而非纯黑），与设计系统统一
 *   2) 入场动画从 fadeInUp 8px → fade-up 12px（更明显但不夸张）
 *   3) Toast 内部不再 truncate 文字（之前 5 字符会显示 1 个字）
 *   4) 自动消失：默认 4s（"撤销" 7s）；通过 useEffect 实现
 *   5) 撤销按钮改用 --c-accent 而非蓝
 */
type ToastItem = ReturnType<typeof useToast.getState>['toasts'][number];

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const hasUndo = !!toast.onUndo;
  const ttl = hasUndo ? 7000 : 4000;

  useEffect(() => {
    const exit = setTimeout(() => setLeaving(true), ttl - 220);
    const kill = setTimeout(onDismiss, ttl);
    return () => {
      clearTimeout(exit);
      clearTimeout(kill);
    };
  }, [ttl, onDismiss]);

  return (
    <div
      className={`
        pointer-events-auto flex items-center gap-3 max-w-sm w-full sm:w-auto
        px-4 py-3 rounded-[var(--radius-lg)]
        bg-[var(--c-text)] text-[var(--c-bg)]
        text-[14px] shadow-[var(--shadow-lg)]
        ${leaving ? 'anim-fade-in opacity-0' : 'anim-slide-up'}
        transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
      `}
      style={leaving ? { opacity: 0, transform: 'translateY(4px)' } : undefined}
    >
      <span className="flex-1 leading-snug">{toast.message}</span>
      {hasUndo && (
        <button
          onClick={() => {
            toast.onUndo!();
            onDismiss();
          }}
          className="font-semibold text-[var(--c-accent-soft)] hover:opacity-80 flex-shrink-0 transition-opacity"
        >
          撤销
        </button>
      )}
      <button
        onClick={onDismiss}
        className="opacity-50 hover:opacity-100 flex-shrink-0 transition-opacity"
        aria-label="关闭"
      >
        <Icon name="close" size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 sm:bottom-8 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
