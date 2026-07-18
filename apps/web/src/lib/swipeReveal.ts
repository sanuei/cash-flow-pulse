import { create } from 'zustand';

/**
 * 跨 EntityRow 协调"当前展开的滑动删除行"——同一时刻只允许一行处于
 * 展开态，滑开新的一行时自动收起其他行（不用逐个组件互相引用）。
 */
interface SwipeRevealState {
  openId: string | null;
  setOpen: (id: string | null) => void;
}

export const useSwipeReveal = create<SwipeRevealState>((set) => ({
  openId: null,
  setOpen: (id) => set({ openId: id }),
}));
