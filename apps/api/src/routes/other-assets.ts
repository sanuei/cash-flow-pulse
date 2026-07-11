/**
 * 其他资产路由（/api/other-assets）
 * 股票/基金、加密货币、房产等，手动估值，不参与现金流计算
 */

import { Hono } from 'hono';
import { OtherAssetInputSchema, OtherAssetUpdateSchema } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now } from '../lib/utils';

export const otherAssetRoutes = new Hono<{ Bindings: Env }>();

// 列表
otherAssetRoutes.get('/', async (c) => {
  const userId = c.get('user')!.id;
  const result = await c.env.DB
    .prepare('SELECT * FROM other_assets WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(userId)
    .all<any>();
  return c.json(result.results || []);
});

// 新增
otherAssetRoutes.post('/', async (c) => {
  const userId = c.get('user')!.id;
  const body = await c.req.json();
  const parsed = OtherAssetInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const id = generateId();
  const ts = now();
  const maxOrder = await c.env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM other_assets WHERE user_id = ?')
    .bind(userId)
    .first<any>();

  await c.env.DB
    .prepare(`INSERT INTO other_assets
      (id, user_id, name, category, value, note, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id, userId, parsed.data.name, parsed.data.category, parsed.data.value,
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

// 更新
otherAssetRoutes.put('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = OtherAssetUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const ts = now();
  const updates: string[] = [];
  const values: any[] = [];
  if (parsed.data.name !== undefined) { updates.push('name = ?'); values.push(parsed.data.name); }
  if (parsed.data.category !== undefined) { updates.push('category = ?'); values.push(parsed.data.category); }
  if (parsed.data.value !== undefined) { updates.push('value = ?'); values.push(parsed.data.value); }
  if (parsed.data.note !== undefined) { updates.push('note = ?'); values.push(parsed.data.note); }
  updates.push('updated_at = ?'); values.push(ts);
  values.push(id, userId);

  const result = await c.env.DB
    .prepare(`UPDATE other_assets SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});

// 删除
otherAssetRoutes.delete('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM other_assets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});
