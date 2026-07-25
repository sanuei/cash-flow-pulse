import { create } from 'zustand';

export interface ToastItem {
  id: string;
  message: string;
  onUndo?: () => void; // 保留兼容位（v1.7 起软删除不再提供撤销，置 undefined）
}

interface ToastState {
  toasts: ToastItem[];
  /** 正在等待确认删除的实体 id —— 列表据此乐观隐藏。
   *  v1.7 起仅在 perform() 飞行期间短暂存在（极短），不再做撤销缓冲。 */
  pendingDeletes: string[];

  /** 普通通知（自动消失） */
  show: (message: string, durationMs?: number) => void;
  dismiss: (id: string) => void;

  /**
   * 删除 + Toast：硬删除模式（v1.7 起）。
   *
   * 设计要点：
   *   - 立刻调 perform() —— perform 内部一般包含「调 DELETE + 从 store 移除」，
   *     这样后端删除和客户端 store 同步几乎同时发生。
   *   - 成功：弹"已删除"Toast（无撤销按钮，硬删除语义清晰）。
   *   - 失败：弹错误 Toast，store 不变（perform 自己处理）。
   *   - 不再有 5 秒撤销窗口 —— 旧版的撤销在「刷新后又恢复」这个 bug 上是
   *     罪魁祸首之一，且如果行真删了再让用户撤销又涉及后端 restore 接口，
   *     改造面太大。硬删除语义与 GitHub / Notion / Linear 主流做法一致。
   *
   * 调用方约定（perform 内部应包含）：
   *   1. await apiDelete('/resource/:id')  ← 后端真删
   *   2. set(state => ({ xxx: state.xxx.filter(x => x.id !== id) }))  ← store 同步
   *   3. await loadDashboard()  ← 可选，让依赖此资源的派生计算一起更新
   */
  softDelete: (params: {
    entityId: string;
    message: string;
    perform: () => Promise<void>;
    durationMs?: number; // 保留兼容位，但不再使用
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

  softDelete: ({ entityId, message, perform }) => {
    // 硬删除：立刻飞请求 + 立刻弹成功 Toast。
    // perform() 内部应自行处理「调 API + loadDashboard」—— 本函数不重复劳动，
    // 也不做撤销缓冲（v1.7 起撤销改为「硬删除 + 无撤销」，详见顶部注释）。
    perform()
      .then(() => {
        // pendingDeletes 是页面列表用来乐观隐藏行的关键（AssetsPage/ExpensesPage
        // 等都从 store 列表里 filter 掉这些 id）。我们不再依赖它做撤销缓冲，
        // 只用它让 UI 在 perform() 完成 → loadDashboard() 完成 之间保持行隐藏。
        // loadDashboard 通常 100-300ms 完成，给 2s 留足余量（弱网/Cold start）。
        const timerKey = `pending:${entityId}`;
        const prev = timers.get(timerKey);
        if (prev) clearTimeout(prev);
        set((s) => ({
          pendingDeletes: s.pendingDeletes.includes(entityId)
            ? s.pendingDeletes
            : [...s.pendingDeletes, entityId],
          toasts: [...s.toasts, { id: uid(), message }],
        }));
        const h = setTimeout(() => {
          timers.delete(timerKey);
          set((s) => ({
            pendingDeletes: s.pendingDeletes.filter((x) => x !== entityId),
          }));
        }, 2000);
        timers.set(timerKey, h);
      })
      .catch((err) => {
        console.warn('[softDelete] perform failed:', err);
        get().show(`删除失败：${err?.message ?? '网络错误'}`, 4000);
      });
  },
}));