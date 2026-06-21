/**
 * 全局状态管理（Zustand）
 *
 * 把所有数据集中在一个 store 里，简单清晰。
 */

import { create } from 'zustand';
import type { DashboardData, CashSource, CreditCard, UserConfig, Snapshot } from '@cfp/shared';
import { apiGet, apiPost, apiPut, apiDelete } from './api';

interface AppState {
  // 数据
  config: UserConfig | null;
  cashSources: CashSource[];
  creditCards: CreditCard[];
  snapshots: Snapshot[];
  calc: DashboardData['calc'] | null;
  prompt: DashboardData['prompt'];
  generatedAt: number | null;

  // 状态
  loading: boolean;
  error: string | null;

  // Actions
  loadDashboard: () => Promise<void>;
  addCash: (data: { name: string; balance: number; locked_amount: number }) => Promise<void>;
  updateCash: (id: string, data: Partial<CashSource>) => Promise<void>;
  deleteCash: (id: string) => Promise<void>;
  addCard: (data: { name: string; statement_amount: number; due_day: number }) => Promise<void>;
  updateCard: (id: string, data: Partial<CreditCard>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  updateConfig: (data: Partial<Pick<UserConfig, 'pay_day' | 'snapshot_offsets'>>) => Promise<void>;
  recordSnapshot: (cycleId: string, offsetIndex: number, note?: string) => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
  config: null,
  cashSources: [],
  creditCards: [],
  snapshots: [],
  calc: null,
  prompt: null,
  generatedAt: null,

  loading: false,
  error: null,

  async loadDashboard() {
    set({ loading: true, error: null });
    try {
      // 后端 /dashboard 返回 DashboardData + generated_at
      type DashboardResponse = Omit<DashboardData, never> & { generated_at: number };
      const data = await apiGet<DashboardResponse>('/dashboard');
      set({
        config: data.config,
        cashSources: data.cash_sources,
        creditCards: data.credit_cards,
        snapshots: data.snapshots,
        calc: data.calc,
        prompt: data.prompt,
        generatedAt: data.generated_at,
        loading: false,
      });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  async addCash(data) {
    await apiPost('/cash', data);
  },
  async updateCash(id, data) {
    await apiPut(`/cash/${id}`, data);
  },
  async deleteCash(id) {
    await apiDelete(`/cash/${id}`);
  },

  async addCard(data) {
    await apiPost('/cards', data);
  },
  async updateCard(id, data) {
    await apiPut(`/cards/${id}`, data);
  },
  async deleteCard(id) {
    await apiDelete(`/cards/${id}`);
  },

  async updateConfig(data) {
    await apiPut('/config', data);
  },

  async recordSnapshot(cycleId, offsetIndex, note) {
    await apiPost('/snapshots', { cycle_id: cycleId, offset_index: offsetIndex, note });
  },
}));