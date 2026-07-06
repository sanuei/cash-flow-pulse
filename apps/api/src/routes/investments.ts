/**
 * 定期投资路由（/api/investments）
 *
 * 完全类比 cash.ts 的 CRUD 模式
 */

import { Hono } from 'hono';
import { InvestmentInputSchema, InvestmentUpdateSchema } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now } from '../lib/utils';

export const investmentRoutes = new Hono<{ Bindings: Env }>();

investmentRoutes.get('/', async (c) => {
  const userId = c.get('user')!.id;
  const result = await c.env.DB
    .prepare('SELECT * FROM recurring_investments WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(userId)
    .all<any>();
  return c.json(result.results || []);
});

investmentRoutes.post('/', async (c) => {
  const userId = c.get('user')!.id;
  const body = await c.req.json();
  const parsed = InvestmentInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const id = generateId();
  const ts = now();
  const maxOrder = await c.env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM recurring_investments WHERE user_id = ?')
    .bind(userId)
    .first<any>();

  await c.env.DB
    .prepare(`INSERT INTO recurring_investments
      (id, user_id, name, amount, frequency, pay_day, day_of_week, start_date, end_date, note, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id, userId, parsed.data.name, parsed.data.amount,
      parsed.data.frequency, parsed.data.pay_day ?? null, parsed.data.day_of_week ?? null,
      parsed.data.start_date,
      parsed.data.end_date ?? null, parsed.data.note ?? null,
      (maxOrder?.max_order ?? -1) + 1, ts, ts
    )
    .run();

  return c.json({
    id, user_id: userId, ...parsed.data,
    sort_order: (maxOrder?.max_order ?? -1) + 1,
    end_date: parsed.data.end_date ?? null,
    note: parsed.data.note ?? null,
    created_at: ts, updated_at: ts,
  }, 201);
});

investmentRoutes.put('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = InvestmentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const ts = now();
  const updates: string[] = [];
  const values: any[] = [];
  if (parsed.data.name !== undefined) { updates.push('name = ?'); values.push(parsed.data.name); }
  if (parsed.data.amount !== undefined) { updates.push('amount = ?'); values.push(parsed.data.amount); }
  if (parsed.data.frequency !== undefined) { updates.push('frequency = ?'); values.push(parsed.data.frequency); }
  if (parsed.data.pay_day !== undefined) { updates.push('pay_day = ?'); values.push(parsed.data.pay_day ?? null); }
  if (parsed.data.day_of_week !== undefined) { updates.push('day_of_week = ?'); values.push(parsed.data.day_of_week ?? null); }
  if (parsed.data.start_date !== undefined) { updates.push('start_date = ?'); values.push(parsed.data.start_date); }
  if (parsed.data.end_date !== undefined) { updates.push('end_date = ?'); values.push(parsed.data.end_date); }
  if (parsed.data.note !== undefined) { updates.push('note = ?'); values.push(parsed.data.note); }
  updates.push('updated_at = ?'); values.push(ts);
  values.push(id, userId);

  const result = await c.env.DB
    .prepare(`UPDATE recurring_investments SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});

investmentRoutes.delete('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM recurring_investments WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});