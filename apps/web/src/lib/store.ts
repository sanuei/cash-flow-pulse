/**
 * 全局状态管理（Zustand）
 *
 * 把所有数据集中在一个 store 里。
 * v0.3 升级：新增 4 类资源 actions + dashboard V2 字段
 */

import { create } from 'zustand';
import { getAutoSnapshotParams } from '@cfp/shared';
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
  OneOffExpense,
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
  oneOffs: OneOffExpense[];

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
  addCard: (data: { name: string; statement_amount: number; due_day: number; monthly_statements?: Record<string, number> }) => Promise<void>;
  updateCard: (id: string, data: Partial<CreditCard>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  updateConfig: (data: Partial<Pick<UserConfig, 'pay_day' | 'snapshot_offsets' | 'weekend_shift'>>) => Promise<void>;
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

  addOneOff: (data: Partial<OneOffExpense>) => Promise<void>;
  updateOneOff: (id: string, data: Partial<OneOffExpense>) => Promise<void>;
  deleteOneOff: (id: string) => Promise<void>;

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
  oneOffs: [],
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
        one_offs: OneOffExpense[];
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
        oneOffs: data.one_offs ?? [],
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
      investments: [], bills: [], incomes: [], subscriptions: [], oneOffs: [],
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
    autoSnapshot(get());
  },
  async updateCash(id, data) {
    await apiPut(`/cash/${id}`, data);
    autoSnapshot(get());
  },
  async deleteCash(id) {
    await apiDelete(`/cash/${id}`);
    autoSnapshot(get());
  },

  async addCard(data) {
    await apiPost('/cards', data);
    autoSnapshot(get());
  },
  async updateCard(id, data) {
    await apiPut(`/cards/${id}`, data);
    autoSnapshot(get());
  },
  async deleteCard(id) {
    await apiDelete(`/cards/${id}`);
    autoSnapshot(get());
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
    autoSnapshot(get());
  },
  async updateInvestment(id, data) {
    await apiPut(`/investments/${id}`, data);
    autoSnapshot(get());
  },
  async deleteInvestment(id) {
    await apiDelete(`/investments/${id}`);
    autoSnapshot(get());
  },

  // ===== v0.3 Actions: Bills =====
  async addBill(data) {
    await apiPost('/bills', data);
    autoSnapshot(get());
  },
  async updateBill(id, data) {
    await apiPut(`/bills/${id}`, data);
    autoSnapshot(get());
  },
  async deleteBill(id) {
    await apiDelete(`/bills/${id}`);
    autoSnapshot(get());
  },

  // ===== v0.3 Actions: Incomes =====
  async addIncome(data) {
    await apiPost('/incomes', data);
    autoSnapshot(get());
  },
  async updateIncome(id, data) {
    await apiPut(`/incomes/${id}`, data);
    autoSnapshot(get());
  },
  async deleteIncome(id) {
    await apiDelete(`/incomes/${id}`);
    autoSnapshot(get());
  },

  // ===== v0.3 Actions: Subscriptions =====
  async addSubscription(data) {
    await apiPost('/subscriptions', data);
    autoSnapshot(get());
  },
  async updateSubscription(id, data) {
    await apiPut(`/subscriptions/${id}`, data);
    autoSnapshot(get());
  },
  async deleteSubscription(id) {
    await apiDelete(`/subscriptions/${id}`);
    autoSnapshot(get());
  },

  // ===== Actions: One-off expenses (临时账单) =====
  async addOneOff(data) {
    await apiPost('/one-off', data);
    autoSnapshot(get());
  },
  async updateOneOff(id, data) {
    await apiPut(`/one-off/${id}`, data);
    autoSnapshot(get());
  },
  async deleteOneOff(id) {
    await apiDelete(`/one-off/${id}`);
    autoSnapshot(get());
  },
}));

// 数据变动后静默打快照（fire-and-forget，失败不影响主操作）
function autoSnapshot(state: { config: UserConfig | null; recordSnapshot: (c: string, o: number, n?: string) => Promise<void> }) {
  const { config } = state;
  if (!config) return;
  const { cycleId, offsetIndex } = getAutoSnapshotParams(new Date(), config);
  state.recordSnapshot(cycleId, offsetIndex).catch(() => { /* 静默忽略 */ });
}