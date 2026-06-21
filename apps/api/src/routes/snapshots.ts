/**
 * 快照路由（/api/snapshots）
 */

import { Hono } from 'hono';
import { computeDashboard, computeDashboardV2, detectUnchanged } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now } from '../lib/utils';

export const snapshotRoutes = new Hono<{ Bindings: Env }>();

// 列表（支持按天数/周期过滤）
snapshotRoutes.get('/', async (c) => {
  const userId = c.get('user')!.id;
  const cycles = c.req.query('cycles'); // 最近 N 个周期
  const days   = c.req.query('days');   // 最近 N 天
  const cycleId = c.req.query('cycle_id');
  const db = c.env.DB;

  let sql: string;
  let params: any[];

  if (cycleId) {
    // 指定周期
    sql = 'SELECT * FROM snapshots WHERE user_id = ? AND cycle_id = ? ORDER BY snapshot_date ASC';
    params = [userId, cycleId];
  } else if (days) {
    // 最近 N 天（连续日期，配合每日采集）
    sql = `SELECT * FROM snapshots WHERE user_id = ?
           AND snapshot_date >= date('now', '-${parseInt(days)} days')
           ORDER BY snapshot_date ASC`;
    params = [userId];
  } else if (cycles) {
    // 最近 N 个发薪周期
    const cycleIds = await db
      .prepare(`SELECT DISTINCT cycle_id FROM snapshots WHERE user_id = ? ORDER BY cycle_id DESC LIMIT ?`)
      .bind(userId, parseInt(cycles))
      .all<any>();
    if (cycleIds.results && cycleIds.results.length > 0) {
      const ids = cycleIds.results.map((r: any) => r.cycle_id);
      sql = `SELECT * FROM snapshots WHERE user_id = ? AND cycle_id IN (${ids.map(() => '?').join(',')}) ORDER BY snapshot_date ASC`;
      params = [userId, ...ids];
    } else {
      return c.json([]);
    }
  } else {
    // 全部
    sql = 'SELECT * FROM snapshots WHERE user_id = ? ORDER BY snapshot_date ASC';
    params = [userId];
  }

  const result = await db.prepare(sql).bind(...params).all<any>();
  return c.json(result.results || []);
});

// 录入快照
snapshotRoutes.post('/', async (c) => {
  const userId = c.get('user')!.id;
  const body = await c.req.json();
  const { cycle_id, offset_index, note } = body;

  if (!cycle_id || typeof offset_index !== 'number') {
    return c.json({ error: 'cycle_id 和 offset_index 必填' }, 400);
  }

  // 并行拉取所有需要的数据
  const [cashRows, cardRows, investmentRows, billRows, incomeRows, subscriptionRows, config] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM cash_sources WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
    c.env.DB.prepare('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
    c.env.DB.prepare('SELECT * FROM recurring_investments WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
    c.env.DB.prepare('SELECT * FROM recurring_bills WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
    c.env.DB.prepare('SELECT * FROM recurring_incomes WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
    c.env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
    c.env.DB.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(userId).first<any>(),
  ]);

  if (!config) return c.json({ error: '用户配置未初始化' }, 500);

  const today = new Date();
  const userConfig = {
    user_id: userId,
    pay_day: config.pay_day,
    snapshot_offsets: JSON.parse(config.snapshot_offsets),
    created_at: config.created_at,
    updated_at: config.updated_at,
  };

  // V2 计算（包含收入/投资/消费汇总，用于曲线新字段）
  const calc = computeDashboardV2(
    today, userConfig,
    cashRows.results || [], cardRows.results || [], [],
    investmentRows.results || [], billRows.results || [],
    incomeRows.results || [], subscriptionRows.results || [],
  );

  // 上一条同日或同周期快照（用于 unchanged 检测）
  const prevSnapshot = await c.env.DB
    .prepare('SELECT * FROM snapshots WHERE user_id = ? AND cycle_id = ? ORDER BY snapshot_date DESC LIMIT 1')
    .bind(userId, cycle_id)
    .first<any>();

  const snapshotDate = today.toISOString().split('T')[0]!;
  const newData = {
    user_id: userId,
    cycle_id,
    offset_index,
    snapshot_date: snapshotDate,
    total_balance: calc.total_balance,
    total_locked: calc.total_locked,
    total_due: calc.total_due,
    net_available: calc.net_available,
    daily_budget: calc.daily_budget,
    days_to_payday: calc.days_to_payday,
    note: note ?? null,
    total_income: calc.total_income,
    total_investment: calc.total_expense - (calc.upcoming_expenses?.total_credit_card ?? 0) - (calc.upcoming_expenses?.total_bills ?? 0) - (calc.upcoming_expenses?.total_subscriptions ?? 0),
    total_expense: calc.total_expense,
  };

  const data_unchanged = detectUnchanged(newData as any, prevSnapshot || undefined);
  const id = generateId();
  const ts = now();

  // UPSERT：同一天重复录入则更新（唯一键已改为 snapshot_date）
  await c.env.DB
    .prepare(`INSERT INTO snapshots
      (id, user_id, cycle_id, offset_index, snapshot_date,
       total_balance, total_locked, total_due, net_available, daily_budget,
       days_to_payday, note, data_unchanged,
       total_income, total_investment, total_expense, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
        cycle_id=excluded.cycle_id, offset_index=excluded.offset_index,
        total_balance=excluded.total_balance, total_locked=excluded.total_locked,
        total_due=excluded.total_due, net_available=excluded.net_available,
        daily_budget=excluded.daily_budget, days_to_payday=excluded.days_to_payday,
        note=excluded.note, data_unchanged=excluded.data_unchanged,
        total_income=excluded.total_income, total_investment=excluded.total_investment,
        total_expense=excluded.total_expense, created_at=excluded.created_at`)
    .bind(
      id, userId, cycle_id, offset_index, snapshotDate,
      newData.total_balance, newData.total_locked, newData.total_due,
      newData.net_available, newData.daily_budget, newData.days_to_payday,
      newData.note, data_unchanged,
      newData.total_income, newData.total_investment, newData.total_expense, ts
    )
    .run();

  return c.json({ ok: true, id, data_unchanged }, 201);
});

// 更新备注
snapshotRoutes.put('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const body = await c.req.json();
  const note = body.note ?? null;

  const result = await c.env.DB
    .prepare('UPDATE snapshots SET note = ? WHERE id = ? AND user_id = ?')
    .bind(note, id, userId)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});

// 删除
snapshotRoutes.delete('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM snapshots WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});