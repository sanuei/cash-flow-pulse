import { create } from 'zustand';

export interface ToastItem {
  id: string;
  message: string;
  onUndo?: () => void; // 有则显示「撤销」按钮
}

interface ToastState {
  toasts: ToastItem[];
  /** 正在等待确认删除的实体 id —— 列表据此乐观隐藏 */
  pendingDeletes: string[];

  /** 普通通知（自动消失） */
  show: (message: string, durationMs?: number) => void;
  dismiss: (id: string) => void;

  /**
   * 软删除：立即乐观隐藏 entityId，弹出可撤销 Toast，
   * durationMs 后才真正执行 perform（调 API）。期间点撤销则取消。
   */
  softDelete: (params: {
    entityId: string;
    message: string;
    perform: () => Promise<void>;
    durationMs?: number;
  }) => void;
}

// 计时器存在模块作用域，不进 React state
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function uid(): string {
  return (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  pendingDeletes: [],

  show: (message, durationMs = 3000) => {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    const h = setTimeout(() => get().dismiss(id), durationMs);
    timers.set(id, h);
  },

  dismiss: (id) => {
    const h = timers.get(id);
    if (h) { clearTimeout(h); timers.delete(id); }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  softDelete: ({ entityId, message, perform, durationMs = 5000 }) => {
    const id = uid();

    const clear = () => {
      const h = timers.get(id);
      if (h) { clearTimeout(h); timers.delete(id); }
      set((s) => ({
        toasts: s.toasts.filter((t) => t.id !== id),
        pendingDeletes: s.pendingDeletes.filter((x) => x !== entityId),
      }));
    };

    // 乐观隐藏 + 弹 Toast（带撤销）
    set((s) => ({
      pendingDeletes: [...s.pendingDeletes, entityId],
      toasts: [...s.toasts, { id, message, onUndo: clear }],
    }));

    // 到期真正删除
    const h = setTimeout(async () => {
      timers.delete(id);
      try {
        await perform();
      } catch {
        // 删除失败：恢复显示（从 pending 移除），并提示
        set((s) => ({ pendingDeletes: s.pendingDeletes.filter((x) => x !== entityId) }));
        get().show('删除失败，请重试');
      }
      set((s) => ({
        toasts: s.toasts.filter((t) => t.id !== id),
        pendingDeletes: s.pendingDeletes.filter((x) => x !== entityId),
      }));
    }, durationMs);
    timers.set(id, h);
  },
}));
