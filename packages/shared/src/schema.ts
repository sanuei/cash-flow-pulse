/**
 * Cash Flow Pulse - Zod Schema（数据校验）
 *
 * 前后端共用。用于：
 * - API 请求体校验（Workers 入口）
 * - 前端表单校验
 * - localStorage 数据迁移
 */

import { z } from 'zod';

// === 现金来源 ===
const CashSourceBaseSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(50),
  balance: z.number().nonnegative('余额不能为负'),
  locked_amount: z.number().nonnegative('锁定金额不能为负'),
});

export const CashSourceInputSchema = CashSourceBaseSchema.refine(
  (data) => data.locked_amount <= data.balance,
  { message: '锁定金额不能超过余额', path: ['locked_amount'] }
);

export const CashSourceUpdateSchema = CashSourceBaseSchema.partial().refine(
  (data) => data.locked_amount === undefined || data.balance === undefined || data.locked_amount <= data.balance,
  { message: '锁定金额不能超过余额', path: ['locked_amount'] }
);

// === 其他资产（股票/基金、加密货币、房产等）===
export const OtherAssetInputSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(50),
  category: z.enum(['stock', 'crypto', 'real_estate', 'other']),
  value: z.number().nonnegative('价值不能为负'),
  note: z.string().max(200).nullable().optional(),
});
export const OtherAssetUpdateSchema = OtherAssetInputSchema.partial();
export type OtherAssetInput = z.infer<typeof OtherAssetInputSchema>;

// === 信用卡 ===
export const CreditCardInputSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(50),
  statement_amount: z.number().nonnegative('账单金额不能为负'),
  due_day: z.number().int().min(1).max(31),
  // 按月账单金额覆盖表：键 YYYY-MM，值为该月账单金额（≥0）
  monthly_statements: z
    .record(z.string().regex(/^\d{4}-\d{2}$/, '月份格式应为 YYYY-MM'), z.number().nonnegative())
    .optional(),
});

export const CreditCardUpdateSchema = CreditCardInputSchema.partial();

// === 用户配置 ===
export const UserConfigUpdateSchema = z.object({
  pay_day: z.number().int().min(1).max(31).optional(),
  snapshot_offsets: z
    .array(z.number().int().min(0).max(30))
    .min(1, '至少 1 个采集点')
    .max(10, '最多 10 个采集点')
    .optional(),
  weekend_shift: z.boolean().optional(),
});

// === 快照 ===
export const SnapshotInputSchema = z.object({
  cycle_id: z.string().regex(/^\d{4}-\d{2}$/, '周期 ID 格式错误（YYYY-MM）'),
  offset_index: z.number().int().min(0).max(9),
  note: z.string().max(200).optional().nullable(),
});

export const SnapshotUpdateSchema = z.object({
  note: z.string().max(200).optional().nullable(),
});

// === 导入数据 ===
// v0.3 升级：version 支持 1 和 2（兼容老 JSON + 新格式含 4 类新表）
export const ImportPayloadSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  exported_at: z.number(),
  config: z.object({
    pay_day: z.number().int().min(1).max(31),
    snapshot_offsets: z.array(z.number().int()),
    weekend_shift: z.boolean().optional(),
  }),
  cash_sources: z.array(z.object({
    name: z.string(),
    balance: z.number(),
    locked_amount: z.number(),
  })),
  credit_cards: z.array(z.object({
    name: z.string(),
    statement_amount: z.number(),
    due_day: z.number(),
    monthly_statements: z.record(z.string(), z.number()).optional(),
  })),
  // v0.3 新增字段（可选，老 JSON 没这些也能导入）
  investments: z.array(z.object({
    name: z.string(),
    amount: z.number(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'single']),
    pay_day: z.number().nullable().optional(),
    day_of_week: z.number().nullable().optional(),
    start_date: z.string(),
    end_date: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })).optional(),
  bills: z.array(z.object({
    name: z.string(),
    amount: z.number(),
    due_day: z.number(),
    note: z.string().nullable().optional(),
  })).optional(),
  incomes: z.array(z.object({
    name: z.string(),
    amount: z.number(),
    frequency: z.enum(['monthly', 'weekly']),
    pay_day: z.number().nullable().optional(),
    day_of_week: z.number().nullable().optional(),
    start_date: z.string(),
    end_date: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })).optional(),
  subscriptions: z.array(z.object({
    name: z.string(),
    amount: z.number(),
    billing_day: z.number(),
    billing_cycle: z.enum(['monthly', 'yearly']).optional(),
    category: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })).optional(),
  one_offs: z.array(z.object({
    name: z.string(),
    amount: z.number(),
    date: z.string(),
    note: z.string().nullable().optional(),
  })).optional(),
  other_assets: z.array(z.object({
    name: z.string(),
    category: z.enum(['stock', 'crypto', 'real_estate', 'other']),
    value: z.number(),
    note: z.string().nullable().optional(),
  })).optional(),
  snapshots: z.array(z.object({
    cycle_id: z.string(),
    offset_index: z.number(),
    snapshot_date: z.string(),
    total_balance: z.number(),
    total_locked: z.number(),
    total_due: z.number(),
    net_available: z.number(),
    daily_budget: z.number(),
    days_to_payday: z.number(),
    note: z.string().nullable().optional(),
  })).optional(),
});

// 导出类型
export type CashSourceInput = z.infer<typeof CashSourceInputSchema>;
export type CreditCardInput = z.infer<typeof CreditCardInputSchema>;
export type UserConfigUpdate = z.infer<typeof UserConfigUpdateSchema>;
export type SnapshotInput = z.infer<typeof SnapshotInputSchema>;
export type ImportPayload = z.infer<typeof ImportPayloadSchema>;

// === v0.3 新增：4 类定期事件 schema ===

// 固定投资
export const InvestmentInputSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(50),
  amount: z.number().nonnegative('金额不能为负'),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'single']),
  // monthly 用 pay_day(1-31)，weekly 用 day_of_week(0-6)，其余为 null
  pay_day: z.number().int().min(1).max(31).nullable().optional(),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式错误（YYYY-MM-DD）'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式错误').nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});
export const InvestmentUpdateSchema = InvestmentInputSchema.partial();

// 固定账单
export const BillInputSchema = z.object({
  name: z.string().min(1).max(50),
  amount: z.number().nonnegative(),
  due_day: z.number().int().min(1).max(31),
  note: z.string().max(200).nullable().optional(),
});
export const BillUpdateSchema = BillInputSchema.partial();

// 固定收入
const IncomeBaseSchema = z.object({
  name: z.string().min(1).max(50),
  amount: z.number().nonnegative(),
  frequency: z.enum(['monthly', 'weekly', 'single']),
  pay_day: z.number().int().min(1).max(31).nullable().optional(),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

export const IncomeInputSchema = IncomeBaseSchema.refine(
  (d) =>
    (d.frequency === 'monthly' && d.pay_day != null && d.day_of_week == null) ||
    (d.frequency === 'weekly' && d.day_of_week != null && d.pay_day == null) ||
    (d.frequency === 'single' && d.pay_day == null && d.day_of_week == null),
  { message: 'monthly 必须填 pay_day；weekly 必须填 day_of_week；single 都不填', path: ['frequency'] },
);

export const IncomeUpdateSchema = IncomeBaseSchema.partial().refine(
  (d) => {
    // 更新时如果三者都给了，验证一致性；如果只给一个就跳过
    if (d.frequency && d.pay_day != null && d.day_of_week != null) {
      return (d.frequency === 'monthly' && d.pay_day != null) ||
             (d.frequency === 'weekly' && d.day_of_week != null) ||
             d.frequency === 'single';
    }
    return true;
  },
  { message: 'pay_day 和 day_of_week 必须与 frequency 匹配', path: ['frequency'] },
);

// 临时账单（一次性支出）
export const OneOffExpenseInputSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(50),
  amount: z.number().nonnegative('金额不能为负'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式错误（YYYY-MM-DD）'),
  note: z.string().max(200).nullable().optional(),
});
export const OneOffExpenseUpdateSchema = OneOffExpenseInputSchema.partial();

// 订阅
export const SubscriptionInputSchema = z.object({
  name: z.string().min(1).max(50),
  amount: z.number().nonnegative(),
  billing_day: z.number().int().min(1).max(31),
  billing_cycle: z.enum(['monthly', 'yearly']).default('monthly'),
  category: z.string().max(50).nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});
export const SubscriptionUpdateSchema = SubscriptionInputSchema.partial();

export type InvestmentInput = z.infer<typeof InvestmentInputSchema>;
export type BillInput = z.infer<typeof BillInputSchema>;
export type IncomeInput = z.infer<typeof IncomeInputSchema>;
export type SubscriptionInput = z.infer<typeof SubscriptionInputSchema>;
export type OneOffExpenseInput = z.infer<typeof OneOffExpenseInputSchema>;