/**
 * 临时账单路由（/api/one-off）
 * 一次性支出，绑定具体日期（date=YYYY-MM-DD）
 */

import { Hono } from 'hono';
import { OneOffExpenseInputSchema, OneOffExpenseUpdateSchema } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now } from '../lib/utils';

export const oneOffRoutes = new Hono<{ Bindings: Env }>();

oneOffRoutes.get('/', async (c) => {
  const userId = c.get('user')!.id;
  const result = await c.env.DB
    .prepare('SELECT * FROM one_off_expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC')
    .bind(userId)
    .all<any>();
  return c.json(result.results || []);
});

oneOffRoutes.post('/', async (c) => {
  const userId = c.get('user')!.id;
  const body = await c.req.json();
  const parsed = OneOffExpenseInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const id = generateId();
  const ts = now();
  const maxOrder = await c.env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM one_off_expenses WHERE user_id = ?')
    .bind(userId)
    .first<any>();

  await c.env.DB
    .prepare(`INSERT INTO one_off_expenses
      (id, user_id, name, amount, date, note, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id, userId, parsed.data.name, parsed.data.amount, parsed.data.date,
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

oneOffRoutes.put('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = OneOffExpenseUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const ts = now();
  const updates: string[] = [];
  const values: any[] = [];
  if (parsed.data.name !== undefined) { updates.push('name = ?'); values.push(parsed.data.name); }
  if (parsed.data.amount !== undefined) { updates.push('amount = ?'); values.push(parsed.data.amount); }
  if (parsed.data.date !== undefined) { updates.push('date = ?'); values.push(parsed.data.date); }
  if (parsed.data.note !== undefined) { updates.push('note = ?'); values.push(parsed.data.note); }
  updates.push('updated_at = ?'); values.push(ts);
  values.push(id, userId);

  const result = await c.env.DB
    .prepare(`UPDATE one_off_expenses SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});

oneOffRoutes.delete('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM one_off_expenses WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});
