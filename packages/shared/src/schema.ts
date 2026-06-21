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
export const CashSourceInputSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(50),
  balance: z.number().nonnegative('余额不能为负'),
  locked_amount: z.number().nonnegative('锁定金额不能为负'),
}).refine((data) => data.locked_amount <= data.balance, {
  message: '锁定金额不能超过余额',
  path: ['locked_amount'],
});

export const CashSourceUpdateSchema = CashSourceInputSchema.partial();

// === 信用卡 ===
export const CreditCardInputSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(50),
  statement_amount: z.number().nonnegative('账单金额不能为负'),
  due_day: z.number().int().min(1).max(31),
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
export const ImportPayloadSchema = z.object({
  version: z.literal(1),
  exported_at: z.number(),
  config: z.object({
    pay_day: z.number().int().min(1).max(31),
    snapshot_offsets: z.array(z.number().int()),
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
  })),
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