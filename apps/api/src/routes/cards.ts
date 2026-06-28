/**
 * 信用卡路由（/api/cards）
 */

import { Hono } from 'hono';
import { CreditCardInputSchema } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now } from '../lib/utils';

export const cardRoutes = new Hono<{ Bindings: Env }>();

/** 把 DB 行的 monthly_statements（TEXT JSON）解析为对象 */
function parseCardRow(row: any) {
  let monthly_statements: Record<string, number> = {};
  if (row?.monthly_statements) {
    try {
      const parsed = JSON.parse(row.monthly_statements);
      if (parsed && typeof parsed === 'object') monthly_statements = parsed;
    } catch {
      // 损坏的 JSON 当作空表处理
    }
  }
  return { ...row, monthly_statements };
}

cardRoutes.get('/', async (c) => {
  const userId = c.get('user')!.id;
  const result = await c.env.DB
    .prepare('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(userId)
    .all<any>();
  return c.json((result.results || []).map(parseCardRow));
});

cardRoutes.post('/', async (c) => {
  const userId = c.get('user')!.id;
  const body = await c.req.json();
  const parsed = CreditCardInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const id = generateId();
  const ts = now();
  const monthlyJson = JSON.stringify(parsed.data.monthly_statements ?? {});
  const maxOrder = await c.env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM credit_cards WHERE user_id = ?')
    .bind(userId)
    .first<any>();
  const sortOrder = (maxOrder?.max_order ?? -1) + 1;

  await c.env.DB
    .prepare('INSERT INTO credit_cards (id, user_id, name, statement_amount, due_day, monthly_statements, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, userId, parsed.data.name, parsed.data.statement_amount, parsed.data.due_day, monthlyJson, sortOrder, ts, ts)
    .run();

  return c.json({
    id,
    name: parsed.data.name,
    statement_amount: parsed.data.statement_amount,
    due_day: parsed.data.due_day,
    monthly_statements: parsed.data.monthly_statements ?? {},
    sort_order: sortOrder,
    created_at: ts,
    updated_at: ts,
  }, 201);
});

cardRoutes.put('/:id', async (c) => {
  const userId = c.get('user')!.id;
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
  if (parsed.data.monthly_statements !== undefined) { updates.push('monthly_statements = ?'); values.push(JSON.stringify(parsed.data.monthly_statements)); }
  updates.push('updated_at = ?'); values.push(ts);
  values.push(id, userId);

  const result = await c.env.DB
    .prepare(`UPDATE credit_cards SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});

cardRoutes.delete('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM credit_cards WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});
