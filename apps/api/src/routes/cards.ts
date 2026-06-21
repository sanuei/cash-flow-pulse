/**
 * 信用卡路由（/api/cards）
 */

import { Hono } from 'hono';
import { CreditCardInputSchema } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now, USER_ID } from '../lib/utils';

export const cardRoutes = new Hono<{ Bindings: Env }>();

cardRoutes.get('/', async (c) => {
  const result = await c.env.DB
    .prepare('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(USER_ID)
    .all<any>();
  return c.json(result.results || []);
});

cardRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = CreditCardInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const id = generateId();
  const ts = now();
  const maxOrder = await c.env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM credit_cards WHERE user_id = ?')
    .bind(USER_ID)
    .first<any>();

  await c.env.DB
    .prepare('INSERT INTO credit_cards (id, user_id, name, statement_amount, due_day, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, USER_ID, parsed.data.name, parsed.data.statement_amount, parsed.data.due_day, (maxOrder?.max_order ?? -1) + 1, ts, ts)
    .run();

  return c.json({ id, ...parsed.data, sort_order: (maxOrder?.max_order ?? -1) + 1, created_at: ts, updated_at: ts }, 201);
});

cardRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = CreditCardInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const ts = now();
  const updates: string[] = [];
  const values: any[] = [];
  if (parsed.data.name !== undefined) { updates.push('name = ?'); values.push(parsed.data.name); }
  if (parsed.data.statement_amount !== undefined) { updates.push('statement_amount = ?'); values.push(parsed.data.statement_amount); }
  if (parsed.data.due_day !== undefined) { updates.push('due_day = ?'); values.push(parsed.data.due_day); }
  updates.push('updated_at = ?'); values.push(ts);
  values.push(id, USER_ID);

  const result = await c.env.DB
    .prepare(`UPDATE credit_cards SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});

cardRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM credit_cards WHERE id = ? AND user_id = ?')
    .bind(id, USER_ID)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});