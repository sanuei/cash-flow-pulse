/**
 * 数据导出/导入（/api/export, /api/import）
 *
 * v0.3 升级：
 * - 导出包含 4 个新表（investments/bills/incomes/subscriptions）
 * - 导入 schema 已扩展（ImportPayloadSchema），但缺字段时兼容老 JSON
 */

import { Hono } from 'hono';
import { ImportPayloadSchema } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now, USER_ID } from '../lib/utils';

export const exportImportRoutes = new Hono<{ Bindings: Env }>();

// 导出 JSON
exportImportRoutes.get('/export', async (c) => {
  const db = c.env.DB;
  const [
    config,
    cash,
    cards,
    snapshots,
    investments,
    bills,
    incomes,
    subscriptions,
  ] = await Promise.all([
    db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(USER_ID).first<any>(),
    db.prepare('SELECT * FROM cash_sources WHERE user_id = ? ORDER BY sort_order').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY sort_order').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM snapshots WHERE user_id = ? ORDER BY snapshot_date').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM recurring_investments WHERE user_id = ? ORDER BY sort_order').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM recurring_bills WHERE user_id = ? ORDER BY sort_order').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM recurring_incomes WHERE user_id = ? ORDER BY sort_order').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY sort_order').bind(USER_ID).all<any>(),
  ]);

  const payload = {
    version: 2,  // v0.3 升级到 version 2
    exported_at: Date.now(),
    config: {
      pay_day: config?.pay_day ?? 10,
      snapshot_offsets: config ? JSON.parse(config.snapshot_offsets) : [0, 7, 14, 21],
    },
    cash_sources: (cash.results || []).map((r: any) => ({
      name: r.name,
      balance: r.balance,
      locked_amount: r.locked_amount,
    })),
    credit_cards: (cards.results || []).map((r: any) => ({
      name: r.name,
      statement_amount: r.statement_amount,
      due_day: r.due_day,
    })),
    // v0.3 新增（可选，老 JSON 不带这些字段也能导入）
    investments: (investments.results || []).map((r: any) => ({
      name: r.name,
      amount: r.amount,
      frequency: r.frequency,
      start_date: r.start_date,
      end_date: r.end_date,
      note: r.note,
    })),
    bills: (bills.results || []).map((r: any) => ({
      name: r.name,
      amount: r.amount,
      due_day: r.due_day,
      note: r.note,
    })),
    incomes: (incomes.results || []).map((r: any) => ({
      name: r.name,
      amount: r.amount,
      frequency: r.frequency,
      pay_day: r.pay_day,
      day_of_week: r.day_of_week,
      start_date: r.start_date,
      end_date: r.end_date,
      note: r.note,
    })),
    subscriptions: (subscriptions.results || []).map((r: any) => ({
      name: r.name,
      amount: r.amount,
      billing_day: r.billing_day,
      billing_cycle: r.billing_cycle,
      category: r.category,
      note: r.note,
    })),
    snapshots: (snapshots.results || []).map((r: any) => ({
      cycle_id: r.cycle_id,
      offset_index: r.offset_index,
      snapshot_date: r.snapshot_date,
      total_balance: r.total_balance,
      total_locked: r.total_locked,
      total_due: r.total_due,
      net_available: r.net_available,
      daily_budget: r.daily_budget,
      days_to_payday: r.days_to_payday,
      note: r.note,
    })),
  };

  c.header('Content-Disposition', `attachment; filename="cash-flow-pulse-${new Date().toISOString().split('T')[0]}.json"`);
  return c.json(payload);
});

// 导出 CSV（快照）
exportImportRoutes.get('/export/snapshots.csv', async (c) => {
  const result = await c.env.DB
    .prepare('SELECT * FROM snapshots WHERE user_id = ? ORDER BY snapshot_date DESC')
    .bind(USER_ID)
    .all<any>();

  const rows = result.results || [];
  const header = 'cycle_id,offset_index,snapshot_date,total_balance,total_locked,total_due,net_available,daily_budget,days_to_payday,note\n';
  const csv = header + rows.map((r: any) =>
    [r.cycle_id, r.offset_index, r.snapshot_date, r.total_balance, r.total_locked, r.total_due, r.net_available, r.daily_budget, r.days_to_payday, JSON.stringify(r.note ?? '')]
      .map(v => String(v).replace(/,/g, ';'))
      .join(',')
  ).join('\n');

  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="snapshots-${new Date().toISOString().split('T')[0]}.csv"`);
  return c.body(csv);
});

// 导入
exportImportRoutes.post('/import', async (c) => {
  const body = await c.req.json();
  const parsed = ImportPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid format', details: parsed.error.flatten() }, 400);
  }

  const mode = c.req.query('mode') ?? 'merge';
  const db = c.env.DB;
  const ts = now();
  const { config, cash_sources, credit_cards, snapshots } = parsed.data;

  // v0.3 新增字段（可选，老 JSON 不带也没事）
  const investments = (parsed.data as any).investments ?? [];
  const bills = (parsed.data as any).bills ?? [];
  const incomes = (parsed.data as any).incomes ?? [];
  const subscriptions = (parsed.data as any).subscriptions ?? [];

  try {
    if (mode === 'overwrite') {
      // 清空所有数据（包括 4 个新表）
      await db.batch([
        db.prepare('DELETE FROM snapshots WHERE user_id = ?').bind(USER_ID),
        db.prepare('DELETE FROM subscriptions WHERE user_id = ?').bind(USER_ID),
        db.prepare('DELETE FROM recurring_incomes WHERE user_id = ?').bind(USER_ID),
        db.prepare('DELETE FROM recurring_bills WHERE user_id = ?').bind(USER_ID),
        db.prepare('DELETE FROM recurring_investments WHERE user_id = ?').bind(USER_ID),
        db.prepare('DELETE FROM credit_cards WHERE user_id = ?').bind(USER_ID),
        db.prepare('DELETE FROM cash_sources WHERE user_id = ?').bind(USER_ID),
      ]);
    }

    // 1. 更新配置
    await db
      .prepare('UPDATE user_config SET pay_day = ?, snapshot_offsets = ?, updated_at = ? WHERE user_id = ?')
      .bind(config.pay_day, JSON.stringify(config.snapshot_offsets), ts, USER_ID)
      .run();

    // 2. 现金来源
    const cashStmts = cash_sources.map((cs, i) =>
      db.prepare('INSERT OR REPLACE INTO cash_sources (id, user_id, name, balance, locked_amount, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(generateId(), USER_ID, cs.name, cs.balance, cs.locked_amount, i, ts, ts)
    );

    // 3. 信用卡
    const cardStmts = credit_cards.map((cc, i) =>
      db.prepare('INSERT OR REPLACE INTO credit_cards (id, user_id, name, statement_amount, due_day, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(generateId(), USER_ID, cc.name, cc.statement_amount, cc.due_day, i, ts, ts)
    );

    // 4. 投资
    const investmentStmts = investments.map((inv: any, i: number) =>
      db.prepare('INSERT OR REPLACE INTO recurring_investments (id, user_id, name, amount, frequency, start_date, end_date, note, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(generateId(), USER_ID, inv.name, inv.amount, inv.frequency, inv.start_date, inv.end_date ?? null, inv.note ?? null, i, ts, ts)
    );

    // 5. 账单
    const billStmts = bills.map((b: any, i: number) =>
      db.prepare('INSERT OR REPLACE INTO recurring_bills (id, user_id, name, amount, due_day, note, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(generateId(), USER_ID, b.name, b.amount, b.due_day, b.note ?? null, i, ts, ts)
    );

    // 6. 收入
    const incomeStmts = incomes.map((inc: any, i: number) =>
      db.prepare('INSERT OR REPLACE INTO recurring_incomes (id, user_id, name, amount, frequency, pay_day, day_of_week, start_date, end_date, note, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(generateId(), USER_ID, inc.name, inc.amount, inc.frequency, inc.pay_day ?? null, inc.day_of_week ?? null, inc.start_date, inc.end_date ?? null, inc.note ?? null, i, ts, ts)
    );

    // 7. 订阅
    const subscriptionStmts = subscriptions.map((s: any, i: number) =>
      db.prepare('INSERT OR REPLACE INTO subscriptions (id, user_id, name, amount, billing_day, billing_cycle, category, note, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(generateId(), USER_ID, s.name, s.amount, s.billing_day, s.billing_cycle ?? 'monthly', s.category ?? null, s.note ?? null, i, ts, ts)
    );

    // 8. 快照
    const snapStmts = (snapshots ?? []).map((s) =>
      db.prepare('INSERT OR REPLACE INTO snapshots (id, user_id, cycle_id, offset_index, snapshot_date, total_balance, total_locked, total_due, net_available, daily_budget, days_to_payday, note, data_unchanged, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)')
        .bind(generateId(), USER_ID, s.cycle_id, s.offset_index, s.snapshot_date, s.total_balance, s.total_locked, s.total_due, s.net_available, s.daily_budget, s.days_to_payday, s.note ?? null, ts)
    );

    await db.batch([
      ...cashStmts, ...cardStmts,
      ...investmentStmts, ...billStmts, ...incomeStmts, ...subscriptionStmts,
      ...snapStmts,
    ]);

    return c.json({
      ok: true,
      imported: {
        cash_sources: cash_sources.length,
        credit_cards: credit_cards.length,
        investments: investments.length,
        bills: bills.length,
        incomes: incomes.length,
        subscriptions: subscriptions.length,
        snapshots: snapshots?.length ?? 0,
      },
    });
  } catch (e: any) {
    return c.json({ error: e.message || 'Import failed' }, 500);
  }
});