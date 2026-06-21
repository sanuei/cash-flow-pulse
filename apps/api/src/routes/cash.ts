/**
 * 现金来源路由（/api/cash）
 */

import { Hono } from 'hono';
import { CashSourceInputSchema, CashSourceUpdateSchema } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now } from '../lib/utils';

export const cashRoutes = new Hono<{ Bindings: Env }>();

// 列表
cashRoutes.get('/', async (c) => {
  const userId = c.get('user')!.id;
  const result = await c.env.DB
    .prepare('SELECT * FROM cash_sources WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(userId)
    .all<any>();
  return c.json(result.results || []);
});

// 新增
cashRoutes.post('/', async (c) => {
  const userId = c.get('user')!.id;
  const body = await c.req.json();
  const parsed = CashSourceInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const id = generateId();
  const ts = now();
  const maxOrder = await c.env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM cash_sources WHERE user_id = ?')
    .bind(userId)
    .first<any>();

  try {
    await c.env.DB
      .prepare('INSERT INTO cash_sources (id, user_id, name, balance, locked_amount, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, userId, parsed.data.name, parsed.data.balance, parsed.data.locked_amount, (maxOrder?.max_order ?? -1) + 1, ts, ts)
      .run();
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return c.json({ error: '名称已存在' }, 409);
    }
    throw e;
  }

  return c.json({ id, ...parsed.data, sort_order: (maxOrder?.max_order ?? -1) + 1, created_at: ts, updated_at: ts }, 201);
});

// 更新
cashRoutes.put('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = CashSourceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const ts = now();
  const updates: string[] = [];
  const values: any[] = [];
  if (parsed.data.name !== undefined) { updates.push('name = ?'); values.push(parsed.data.name); }
  if (parsed.data.balance !== undefined) { updates.push('balance = ?'); values.push(parsed.data.balance); }
  if (parsed.data.locked_amount !== undefined) { updates.push('locked_amount = ?'); values.push(parsed.data.locked_amount); }
  updates.push('updated_at = ?'); values.push(ts);
  values.push(id, userId);

  const result = await c.env.DB
    .prepare(`UPDATE cash_sources SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Not Found' }, 404);
  }

  return c.json({ ok: true });
});

// 删除
cashRoutes.delete('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM cash_sources WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Not Found' }, 404);
  }

  return c.json({ ok: true });
});