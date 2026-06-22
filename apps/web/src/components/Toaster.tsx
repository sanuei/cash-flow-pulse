import { useToast } from '../lib/toast';
import { Icon } from './Icon';

/**
 * 全局 Toast 容器。挂在 App 根部一次。
 * 移动端浮在底部导航栏上方，桌面端居中靠下。
 */
export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 sm:bottom-6 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 max-w-sm w-full sm:w-auto bg-notion-text text-white text-sm px-4 py-3 rounded-comfortable shadow-deep animate-[fadeInUp_0.15s_ease-out]"
        >
          <span className="flex-1 truncate">{t.message}</span>
          {t.onUndo && (
            <button
              onClick={() => t.onUndo!()}
              className="font-semibold text-notion-blue hover:underline flex-shrink-0"
            >
              撤销
            </button>
          )}
          <button
            onClick={() => dismiss(t.id)}
            className="text-white/50 hover:text-white flex-shrink-0"
            aria-label="关闭"
          >
            <Icon name="close" size={14} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}
