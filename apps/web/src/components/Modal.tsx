import { ReactNode, useEffect } from 'react';

/**
 * 模态框（Notion 风格：5 层深阴影 + 16px 圆角）
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-large shadow-deep max-w-md w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <header className="px-6 py-4 border-b border-notion-border flex items-center justify-between">
            <h3 className="text-base font-bold">{title}</h3>
            <button onClick={onClose} className="text-notion-text-muted hover:text-notion-text text-xl">
              ×
            </button>
          </header>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}