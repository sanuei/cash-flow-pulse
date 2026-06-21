/**
 * 订阅路由（/api/subscriptions）
 */

import { Hono } from 'hono';
import { SubscriptionInputSchema, SubscriptionUpdateSchema } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now, USER_ID } from '../lib/utils';

export const subscriptionRoutes = new Hono<{ Bindings: Env }>();

subscriptionRoutes.get('/', async (c) => {
  const result = await c.env.DB
    .prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(USER_ID)
    .all<any>();
  return c.json(result.results || []);
});

subscriptionRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = SubscriptionInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const id = generateId();
  const ts = now();
  const maxOrder = await c.env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM subscriptions WHERE user_id = ?')
    .bind(USER_ID)
    .first<any>();

  await c.env.DB
    .prepare(`INSERT INTO subscriptions
      (id, user_id, name, amount, billing_day, billing_cycle, category, note, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id, USER_ID, parsed.data.name, parsed.data.amount,
      parsed.data.billing_day, parsed.data.billing_cycle,
      parsed.data.category ?? null, parsed.data.note ?? null,
      (maxOrder?.max_order ?? -1) + 1, ts, ts
    )
    .run();

  return c.json({
    id, user_id: USER_ID, ...parsed.data,
    sort_order: (maxOrder?.max_order ?? -1) + 1,
    category: parsed.data.category ?? null,
    note: parsed.data.note ?? null,
    created_at: ts, updated_at: ts,
  }, 201);
});

subscriptionRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = SubscriptionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const ts = now();
  const updates: string[] = [];
  const values: any[] = [];
  if (parsed.data.name !== undefined) { updates.push('name = ?'); values.push(parsed.data.name); }
  if (parsed.data.amount !== undefined) { updates.push('amount = ?'); values.push(parsed.data.amount); }
  if (parsed.data.billing_day !== undefined) { updates.push('billing_day = ?'); values.push(parsed.data.billing_day); }
  if (parsed.data.billing_cycle !== undefined) { updates.push('billing_cycle = ?'); values.push(parsed.data.billing_cycle); }
  if (parsed.data.category !== undefined) { updates.push('category = ?'); values.push(parsed.data.category); }
  if (parsed.data.note !== undefined) { updates.push('note = ?'); values.push(parsed.data.note); }
  updates.push('updated_at = ?'); values.push(ts);
  values.push(id, USER_ID);

  const result = await c.env.DB
    .prepare(`UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});

subscriptionRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?')
    .bind(id, USER_ID)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});