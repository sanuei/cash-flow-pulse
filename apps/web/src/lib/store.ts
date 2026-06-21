/**
 * 全局状态管理（Zustand）
 *
 * 把所有数据集中在一个 store 里。
 * v0.3 升级：新增 4 类资源 actions + dashboard V2 字段
 */

import { create } from 'zustand';
import type {
  CashSource,
  CreditCard,
  UserConfig,
  Snapshot,
  SnapshotPrompt,
  RecurringInvestment,
  RecurringBill,
  RecurringIncome,
  Subscription,
  DashboardCalc,
  UpcomingExpenses,
  UpcomingIncomes,
} from '@cfp/shared';
// v0.3: 计算结果使用 V2 类型（包含 upcoming_expenses/incomes）
type DashboardCalcV2 = DashboardCalc & {
  prompt: SnapshotPrompt | null;
  currentSnapshots: Snapshot[];
  upcoming_expenses: UpcomingExpenses;
  upcoming_incomes: UpcomingIncomes;
  total_expense: number;
  total_income: number;
  net_flow: number;
};
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from './api';

// v1.0+ 多用户
export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  tier: 'free' | 'pro';
  is_admin: boolean;
}

interface AppState {
  // ===== V1 数据 =====
  config: UserConfig | null;
  cashSources: CashSource[];
  creditCards: CreditCard[];
  snapshots: Snapshot[];

  // ===== v0.3 新增数据 =====
  investments: RecurringInvestment[];
  bills: RecurringBill[];
  incomes: RecurringIncome[];
  subscriptions: Subscription[];

  // ===== 计算结果 =====
  calc: DashboardCalcV2 | null;
  prompt: DashboardCalcV2['prompt'] | null;
  generatedAt: number | null;

  // ===== 状态 =====
  loading: boolean;
  error: string | null;

  // ===== Auth (v1.0+) =====
  currentUser: CurrentUser | null;
  authStatus: 'unknown' | 'authenticated' | 'unauthenticated';  // 初始化时 unknown，check 后确定

  // ===== V1 Actions =====
  loadDashboard: () => Promise<void>;
  addCash: (data: { name: string; balance: number; locked_amount: number }) => Promise<void>;
  updateCash: (id: string, data: Partial<CashSource>) => Promise<void>;
  deleteCash: (id: string) => Promise<void>;
  addCard: (data: { name: string; statement_amount: number; due_day: number }) => Promise<void>;
  updateCard: (id: string, data: Partial<CreditCard>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  updateConfig: (data: Partial<Pick<UserConfig, 'pay_day' | 'snapshot_offsets'>>) => Promise<void>;
  recordSnapshot: (cycleId: string, offsetIndex: number, note?: string) => Promise<void>;

  // ===== v0.3 Actions =====
  addInvestment: (data: Partial<RecurringInvestment>) => Promise<void>;
  updateInvestment: (id: string, data: Partial<RecurringInvestment>) => Promise<void>;
  deleteInvestment: (id: string) => Promise<void>;

  addBill: (data: Partial<RecurringBill>) => Promise<void>;
  updateBill: (id: string, data: Partial<RecurringBill>) => Promise<void>;
  deleteBill: (id: string) => Promise<void>;

  addIncome: (data: Partial<RecurringIncome>) => Promise<void>;
  updateIncome: (id: string, data: Partial<RecurringIncome>) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;

  addSubscription: (data: Partial<Subscription>) => Promise<void>;
  updateSubscription: (id: string, data: Partial<Subscription>) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;

  // ===== Auth Actions (v1.0+) =====
  checkSession: () => Promise<void>;
  logout: () => Promise<void>;
  startGoogleLogin: () => void;  // window.location.href = '/api/auth/google'
}

export const useStore = create<AppState>((set, get) => ({
  // ===== V1 =====
  config: null,
  cashSources: [],
  creditCards: [],
  snapshots: [],
  // ===== v0.3 =====
  investments: [],
  bills: [],
  incomes: [],
  subscriptions: [],
  // ===== 计算 =====
  calc: null,
  prompt: null,
  generatedAt: null,
  // ===== 状态 =====
  loading: false,
  error: null,
  // ===== Auth =====
  currentUser: null,
  authStatus: 'unknown',

  async loadDashboard() {
    set({ loading: true, error: null });
    try {
      // dashboard 端点返回 DashboardData + generated_at + 4 类新数据
      type DashboardResponse = {
        config: UserConfig;
        cash_sources: CashSource[];
        credit_cards: CreditCard[];
        investments: RecurringInvestment[];
        bills: RecurringBill[];
        incomes: RecurringIncome[];
        subscriptions: Subscription[];
        calc: DashboardCalcV2;
        snapshots: Snapshot[];
        prompt: DashboardCalcV2['prompt'] | null;
        generated_at: number;
      };
      const data = await apiGet<DashboardResponse>('/dashboard');
      set({
        config: data.config,
        cashSources: data.cash_sources,
        creditCards: data.credit_cards,
        investments: data.investments ?? [],
        bills: data.bills ?? [],
        incomes: data.incomes ?? [],
        subscriptions: data.subscriptions ?? [],
        snapshots: data.snapshots,
        calc: data.calc,
        prompt: data.prompt,
        generatedAt: data.generated_at,
        loading: false,
      });
    } catch (e) {
      // 401 = session 失效，跳登录页（App.tsx 会处理）
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        set({ currentUser: null, authStatus: 'unauthenticated', loading: false });
        return;
      }
      set({ error: (e as Error).message, loading: false });
    }
  },

  // ===== Auth Actions =====
  async checkSession() {
    try {
      const me = await apiGet<CurrentUser>('/auth/me');
      set({ currentUser: me, authStatus: 'authenticated' });
      return;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        set({ currentUser: null, authStatus: 'unauthenticated' });
        return;
      }
      // 网络错误等：保持 unknown，不跳登录
      console.warn('checkSession error:', e);
    }
  },

  async logout() {
    try {
      // apiPost 带 cookie，但 /api/auth/logout 路径需要特殊处理（fetchWithCreds 已支持）
      await apiPost('/auth/logout', {});
    } catch (e) {
      console.warn('logout API error (cookie may still be cleared):', e);
    }
    // 清 store + 跳登录
    set({
      currentUser: null,
      authStatus: 'unauthenticated',
      config: null,
      cashSources: [], creditCards: [], snapshots: [],
      investments: [], bills: [], incomes: [], subscriptions: [],
      calc: null, prompt: null, generatedAt: null,
      error: null,
    });
  },

  startGoogleLogin() {
    // 使用自定义域名，Google consent screen 显示 cashflow.soniclab.cc 而非 workers.dev
    // cashflow.soniclab.cc/api/* → CF Workers Route → cash-flow-pulse-api Worker
    // Google Console 里 redirect_uri 必须配 https://cashflow.soniclab.cc/api/auth/callback/google
    window.location.href = 'https://cashflow.soniclab.cc/api/auth/google';
  },

  // ===== V1 Actions =====
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

  // ===== v0.3 Actions: Investments =====
  async addInvestment(data) {
    await apiPost('/investments', data);
  },
  async updateInvestment(id, data) {
    await apiPut(`/investments/${id}`, data);
  },
  async deleteInvestment(id) {
    await apiDelete(`/investments/${id}`);
  },

  // ===== v0.3 Actions: Bills =====
  async addBill(data) {
    await apiPost('/bills', data);
  },
  async updateBill(id, data) {
    await apiPut(`/bills/${id}`, data);
  },
  async deleteBill(id) {
    await apiDelete(`/bills/${id}`);
  },

  // ===== v0.3 Actions: Incomes =====
  async addIncome(data) {
    await apiPost('/incomes', data);
  },
  async updateIncome(id, data) {
    await apiPut(`/incomes/${id}`, data);
  },
  async deleteIncome(id) {
    await apiDelete(`/incomes/${id}`);
  },

  // ===== v0.3 Actions: Subscriptions =====
  async addSubscription(data) {
    await apiPost('/subscriptions', data);
  },
  async updateSubscription(id, data) {
    await apiPut(`/subscriptions/${id}`, data);
  },
  async deleteSubscription(id) {
    await apiDelete(`/subscriptions/${id}`);
  },
}));