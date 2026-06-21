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
  statement_amount: number;    // 账单金额 ≥ 0
  due_day: number;             // 扣款日 1-31
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