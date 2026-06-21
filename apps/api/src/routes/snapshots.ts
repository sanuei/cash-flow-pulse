/**
 * 快照路由（/api/snapshots）
 */

import { Hono } from 'hono';
import { computeDashboard, detectUnchanged } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now, USER_ID } from '../lib/utils';

export const snapshotRoutes = new Hono<{ Bindings: Env }>();

// 列表（支持按周期过滤）
snapshotRoutes.get('/', async (c) => {
  const cycles = c.req.query('cycles'); // 最近 N 个周期
  const cycleId = c.req.query('cycle_id');

  let sql = 'SELECT * FROM snapshots WHERE user_id = ?';
  const params: any[] = [USER_ID];

  if (cycleId) {
    sql += ' AND cycle_id = ?';
    params.push(cycleId);
  }

  sql += ' ORDER BY snapshot_date DESC, offset_index ASC';

  if (cycles && !cycleId) {
    // 取最近 N 个周期的快照
    const cycleIds = await c.env.DB
      .prepare(`SELECT DISTINCT cycle_id FROM snapshots WHERE user_id = ? ORDER BY cycle_id DESC LIMIT ?`)
      .bind(USER_ID, parseInt(cycles))
      .all<any>();
    if (cycleIds.results && cycleIds.results.length > 0) {
      const ids = cycleIds.results.map(r => r.cycle_id);
      sql = `SELECT * FROM snapshots WHERE user_id = ? AND cycle_id IN (${ids.map(() => '?').join(',')}) ORDER BY snapshot_date ASC, offset_index ASC`;
      params.length = 0;
      params.push(USER_ID, ...ids);
    }
  }

  const result = await c.env.DB.prepare(sql).bind(...params).all<any>();
  return c.json(result.results || []);
});

// 录入快照
snapshotRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { cycle_id, offset_index, note } = body;

  if (!cycle_id || typeof offset_index !== 'number') {
    return c.json({ error: 'cycle_id 和 offset_index 必填' }, 400);
  }

  // 拉取最新现金和信用卡数据
  const cashRows = await c.env.DB
    .prepare('SELECT * FROM cash_sources WHERE user_id = ? ORDER BY sort_order')
    .bind(USER_ID)
    .all<any>();
  const cardRows = await c.env.DB
    .prepare('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY sort_order')
    .bind(USER_ID)
    .all<any>();
  const config = await c.env.DB
    .prepare('SELECT * FROM user_config WHERE user_id = ?')
    .bind(USER_ID)
    .first<any>();

  if (!config) {
    return c.json({ error: '用户配置未初始化' }, 500);
  }

  // 计算仪表盘
  const today = new Date();
  const calc = computeDashboard(
    today,
    {
      user_id: USER_ID,
      pay_day: config.pay_day,
      snapshot_offsets: JSON.parse(config.snapshot_offsets),
      created_at: config.created_at,
      updated_at: config.updated_at,
    },
    cashRows.results || [],
    cardRows.results || [],
  );

  // 上一同周期快照（用于检测 unchanged）
  const prevSnapshot = await c.env.DB
    .prepare('SELECT * FROM snapshots WHERE user_id = ? AND cycle_id = ? AND offset_index < ? ORDER BY offset_index DESC LIMIT 1')
    .bind(USER_ID, cycle_id, offset_index)
    .first<any>();

  const newData = {
    user_id: USER_ID,
    cycle_id,
    offset_index,
    snapshot_date: calc.cycle_id === cycle_id ? today.toISOString().split('T')[0] : '',
    total_balance: calc.total_balance,
    total_locked: calc.total_locked,
    total_due: calc.total_due,
    net_available: calc.net_available,
    daily_budget: calc.daily_budget,
    days_to_payday: calc.days_to_payday,
    note: note ?? null,
  };

  const data_unchanged = detectUnchanged(newData as any, prevSnapshot || undefined);
  const id = generateId();
  const ts = now();

  try {
    await c.env.DB
      .prepare(`INSERT INTO snapshots (id, user_id, cycle_id, offset_index, snapshot_date, total_balance, total_locked, total_due, net_available, daily_budget, days_to_payday, note, data_unchanged, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id, newData.user_id, newData.cycle_id, newData.offset_index, newData.snapshot_date,
        newData.total_balance, newData.total_locked, newData.total_due,
        newData.net_available, newData.daily_budget, newData.days_to_payday,
        newData.note, data_unchanged, ts
      )
      .run();
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      // 已有同周期同点位 → 更新
      await c.env.DB
        .prepare(`UPDATE snapshots SET total_balance = ?, total_locked = ?, total_due = ?, net_available = ?, daily_budget = ?, days_to_payday = ?, note = ?, data_unchanged = ?, created_at = ? WHERE user_id = ? AND cycle_id = ? AND offset_index = ?`)
        .bind(newData.total_balance, newData.total_locked, newData.total_due, newData.net_available, newData.daily_budget, newData.days_to_payday, newData.note, data_unchanged, ts, USER_ID, cycle_id, offset_index)
        .run();
      return c.json({ ok: true, updated: true });
    }
    throw e;
  }

  return c.json({ ok: true, id, data_unchanged }, 201);
});

// 更新备注
snapshotRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const note = body.note ?? null;

  const result = await c.env.DB
    .prepare('UPDATE snapshots SET note = ? WHERE id = ? AND user_id = ?')
    .bind(note, id, USER_ID)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});

// 删除
snapshotRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM snapshots WHERE id = ? AND user_id = ?')
    .bind(id, USER_ID)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});