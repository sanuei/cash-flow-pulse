/**
 * 固定账单路由（/api/bills）
 */

import { Hono } from 'hono';
import { BillInputSchema, BillUpdateSchema } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now } from '../lib/utils';

export const billRoutes = new Hono<{ Bindings: Env }>();

billRoutes.get('/', async (c) => {
  const userId = c.get('user')!.id;
  const result = await c.env.DB
    .prepare('SELECT * FROM recurring_bills WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(userId)
    .all<any>();
  return c.json(result.results || []);
});

billRoutes.post('/', async (c) => {
  const userId = c.get('user')!.id;
  const body = await c.req.json();
  const parsed = BillInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const id = generateId();
  const ts = now();
  const maxOrder = await c.env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM recurring_bills WHERE user_id = ?')
    .bind(userId)
    .first<any>();

  await c.env.DB
    .prepare(`INSERT INTO recurring_bills
      (id, user_id, name, amount, due_day, note, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id, userId, parsed.data.name, parsed.data.amount, parsed.data.due_day,
      parsed.data.note ?? null,
      (maxOrder?.max_order ?? -1) + 1, ts, ts
    )
    .run();

  return c.json({
    id, user_id: userId, ...parsed.data,
    sort_order: (maxOrder?.max_order ?? -1) + 1,
    note: parsed.data.note ?? null,
    created_at: ts, updated_at: ts,
  }, 201);
});

billRoutes.put('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = BillUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const ts = now();
  const updates: string[] = [];
  const values: any[] = [];
  if (parsed.data.name !== undefined) { updates.push('name = ?'); values.push(parsed.data.name); }
  if (parsed.data.amount !== undefined) { updates.push('amount = ?'); values.push(parsed.data.amount); }
  if (parsed.data.due_day !== undefined) { updates.push('due_day = ?'); values.push(parsed.data.due_day); }
  if (parsed.data.note !== undefined) { updates.push('note = ?'); values.push(parsed.data.note); }
  updates.push('updated_at = ?'); values.push(ts);
  values.push(id, userId);

  const result = await c.env.DB
    .prepare(`UPDATE recurring_bills SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});

billRoutes.delete('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM recurring_bills WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});