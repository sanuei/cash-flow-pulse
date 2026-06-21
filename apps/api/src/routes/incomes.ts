/**
 * 固定收入路由（/api/incomes）
 *
 * 注意：IncomeInputSchema 有 .refine()，所以校验失败时 details 里包含 formErrors
 */

import { Hono } from 'hono';
import { IncomeInputSchema, IncomeUpdateSchema } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now, USER_ID } from '../lib/utils';

export const incomeRoutes = new Hono<{ Bindings: Env }>();

incomeRoutes.get('/', async (c) => {
  const result = await c.env.DB
    .prepare('SELECT * FROM recurring_incomes WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(USER_ID)
    .all<any>();
  return c.json(result.results || []);
});

incomeRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = IncomeInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const id = generateId();
  const ts = now();
  const maxOrder = await c.env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM recurring_incomes WHERE user_id = ?')
    .bind(USER_ID)
    .first<any>();

  await c.env.DB
    .prepare(`INSERT INTO recurring_incomes
      (id, user_id, name, amount, frequency, pay_day, day_of_week, start_date, end_date, note, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id, USER_ID, parsed.data.name, parsed.data.amount, parsed.data.frequency,
      parsed.data.pay_day ?? null, parsed.data.day_of_week ?? null,
      parsed.data.start_date, parsed.data.end_date ?? null,
      parsed.data.note ?? null,
      (maxOrder?.max_order ?? -1) + 1, ts, ts
    )
    .run();

  return c.json({
    id, user_id: USER_ID, ...parsed.data,
    sort_order: (maxOrder?.max_order ?? -1) + 1,
    pay_day: parsed.data.pay_day ?? null,
    day_of_week: parsed.data.day_of_week ?? null,
    end_date: parsed.data.end_date ?? null,
    note: parsed.data.note ?? null,
    created_at: ts, updated_at: ts,
  }, 201);
});

incomeRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = IncomeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const ts = now();
  const updates: string[] = [];
  const values: any[] = [];
  if (parsed.data.name !== undefined) { updates.push('name = ?'); values.push(parsed.data.name); }
  if (parsed.data.amount !== undefined) { updates.push('amount = ?'); values.push(parsed.data.amount); }
  if (parsed.data.frequency !== undefined) { updates.push('frequency = ?'); values.push(parsed.data.frequency); }
  if (parsed.data.pay_day !== undefined) { updates.push('pay_day = ?'); values.push(parsed.data.pay_day); }
  if (parsed.data.day_of_week !== undefined) { updates.push('day_of_week = ?'); values.push(parsed.data.day_of_week); }
  if (parsed.data.start_date !== undefined) { updates.push('start_date = ?'); values.push(parsed.data.start_date); }
  if (parsed.data.end_date !== undefined) { updates.push('end_date = ?'); values.push(parsed.data.end_date); }
  if (parsed.data.note !== undefined) { updates.push('note = ?'); values.push(parsed.data.note); }
  updates.push('updated_at = ?'); values.push(ts);
  values.push(id, USER_ID);

  const result = await c.env.DB
    .prepare(`UPDATE recurring_incomes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});

incomeRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM recurring_incomes WHERE id = ? AND user_id = ?')
    .bind(id, USER_ID)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});