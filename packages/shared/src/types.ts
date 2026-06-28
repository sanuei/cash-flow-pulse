/**
 * Cash Flow Pulse - 共享类型定义
 *
 * 这是前后端共用的"数据契约"。任何对数据模型的修改都必须同步修改：
 * 1. apps/api/src/db/schema.sql（D1 表结构）
 * 2. apps/api/src/routes/*（Workers API 端点）
 * 3. apps/web/src/types/*（前端状态）
 */

// === 用户配置 ===
export interface UserConfig {
  user_id: string;             // V1 固定 'default'
  pay_day: number;             // 1-31
  snapshot_offsets: number[];  // 相对发薪日的天数偏移，如 [0, 7, 14, 21]
  weekend_shift: boolean;      // 扣款日遇周六/日时顺延至下一个工作日（周一）
  created_at: number;          // Unix ms
  updated_at: number;
}

// === 现金来源 ===
export interface CashSource {
  id: string;                  // UUID
  user_id: string;
  name: string;                // 如「钱包现金」「PayPay」
  balance: number;             // 当前余额 ≥ 0
  locked_amount: number;       // 锁定金额 ≥ 0 且 ≤ balance
  sort_order: number;
  created_at: number;
  updated_at: number;
}

// === 信用卡 ===
export interface CreditCard {
  id: string;
  user_id: string;
  name: string;
  statement_amount: number;    // 默认账单金额 ≥ 0（未单独设置的月份用此值）
  due_day: number;             // 扣款日 1-31
  /**
   * 按月账单金额覆盖表：键为 YYYY-MM（扣款日所在年月），值为该月账单金额。
   * 某月有条目则用该值，否则回退到 statement_amount。
   */
  monthly_statements?: Record<string, number>;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

// === 快照 ===
export interface Snapshot {
  id: string;
  user_id: string;
  cycle_id: string;            // YYYY-MM，基于周期起点的年月
  offset_index: number;        // 0-3，对应 4 个采集点
  snapshot_date: string;       // YYYY-MM-DD
  total_balance: number;
  total_locked: number;
  total_due: number;           // 活跃信用卡应还
  net_available: number;       // total_balance - total_locked - total_due
  daily_budget: number;        // net_available / days_to_payday
  days_to_payday: number;
  note: string | null;
  data_unchanged: 0 | 1;       // 与上一采集点对比，1 = 无变化
  created_at: number;
}

// === 计算结果（前端展示用）===
export interface DashboardData {
  config: UserConfig;
  cash_sources: CashSource[];
  credit_cards: CreditCard[];
  calc: DashboardCalc;
  snapshots: Snapshot[];          // 当前周期的所有快照
  prompt: SnapshotPrompt | null;  // 采集点提示（null 表示不提示）
}

export interface DashboardCalc {
  total_balance: number;          // 所有现金来源余额之和
  total_locked: number;           // 所有锁定金额之和
  total_net_cash: number;         // 总净现金 = total_balance - total_locked
  active_cards: ActiveCard[];     // 当前周期活跃的卡（含计算明细）
  inactive_cards: CreditCard[];   // 非活跃卡（仅展示）
  total_due: number;              // 活跃卡应还之和
  net_available: number;          // total_net_cash - total_due
  days_to_payday: number;
  daily_budget: number;           // net_available / days_to_payday
  next_payday_date: string;       // YYYY-MM-DD
  cycle_id: string;               // 当前周期 ID
  current_cycle_day: number;      // 当前是周期的第几天（0-indexed）
}

export interface ActiveCard {
  card: CreditCard;
  due_date: string;               // 本周期内的实际扣款日 YYYY-MM-DD
  days_until_due: number;         // 距扣款日天数
  amount: number;                 // 本期生效账单金额（按月覆盖后的实际值）
}

export interface SnapshotPrompt {
  cycle_id: string;
  offset_index: number;
  offset_days: number;            // 该采集点的 offset 值
  cycle_day: number;              // 该采集点在周期内的第几天
  exists: boolean;                // 是否已录入过
}

// === 周期 / 日期工具返回类型 ===
export interface PayCycle {
  cycle_id: string;               // YYYY-MM
  start_date: Date;               // 周期起始日 = 本期发薪日
  end_date: Date;                 // 周期结束日 = 下期发薪日（不含）
  start_date_str: string;         // YYYY-MM-DD
  end_date_str: string;
}

// === v0.3 新增：定期事件类型 ===

/**
 * 固定投资（每天/每周/每月/每年自动扣款）
 * 频率决定 start_date 的语义：
 *   daily   → start_date 起每天扣一次
 *   weekly  → start_date 起每周同一天扣一次
 *   monthly → start_date 起每月同日扣一次
 *   yearly  → start_date 起每年同月同日扣一次
 */
export type InvestmentFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringInvestment {
  id: string;
  user_id: string;
  name: string;
  amount: number;                  // ≥ 0
  frequency: InvestmentFrequency;
  start_date: string;              // YYYY-MM-DD
  end_date: string | null;         // YYYY-MM-DD，null = 永久
  note: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

/**
 * 固定账单（房租、水电等每月固定日期自动扣款）
 * 算法与现有信用卡完全一致（用 due_day 在周期内匹配）
 */
export interface RecurringBill {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  due_day: number;                 // 1-31
  note: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

/**
 * 固定收入（工资、副业等）
 * monthly: 用 pay_day 1-31
 * weekly:  用 day_of_week 0-6（0=周日）
 * single:  用 start_date (单次到账,start_date == end_date)
 */
export type IncomeFrequency = 'monthly' | 'weekly' | 'single';

export interface RecurringIncome {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  pay_day: number | null;          // 1-31，monthly 用
  day_of_week: number | null;      // 0-6，weekly 用
  start_date: string;              // YYYY-MM-DD
  end_date: string | null;
  note: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

/**
 * 订阅（Netflix/Spotify 等，每月或每年固定日期自动扣款）
 */
export type SubscriptionCycle = 'monthly' | 'yearly';

export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  billing_day: number;             // 1-31
  billing_cycle: SubscriptionCycle;
  category: string | null;         // 可选分类：影音/工具/云存储
  note: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

// === v0.3 新增：本期支出/收入展开后的明细项 ===

export interface UpcomingExpenseItem {
  source_type: 'credit_card' | 'bill' | 'subscription' | 'investment';
  id: string;
  name: string;
  amount: number;                  // 单次金额（投资是单次扣款额）
  occurrences: number;             // 本期内发生次数（投资专用，其他 = 1）
  total: number;                   // amount * occurrences
  due_date: string;                // YYYY-MM-DD，下次/本期内扣款日（投资取首日）
  days_until: number;              // 距今天数（投资 = 0）
  // v0.3.1: 投资专用
  frequency?: InvestmentFrequency;
  // v0.3.2: 标记是否在本期内（用于前端视觉标记"下期扣款"）
  in_current_cycle?: boolean;
}

export interface UpcomingIncomeItem {
  id: string;
  name: string;
  amount: number;
  pay_date: string;                // YYYY-MM-DD
  days_until: number;
}

// === v0.3 新增：升级版 DashboardCalc（在原基础上加字段） ===

export interface UpcomingExpenses {
  credit_cards: ActiveCard[];      // 复用 V1 类型
  bills: UpcomingExpenseItem[];
  subscriptions: UpcomingExpenseItem[];
  investments: UpcomingExpenseItem[];
  total_credit_card: number;
  total_bills: number;
  total_subscriptions: number;
  total_investments: number;
  grand_total: number;             // = sum of all 4
}

export interface UpcomingIncomes {
  items: UpcomingIncomeItem[];
  total: number;
}