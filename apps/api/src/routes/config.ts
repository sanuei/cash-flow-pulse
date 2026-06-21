/**
 * 用户配置路由（/api/config）
 *
 * V1 单用户固定 user_id='default'。
 * 首次访问会自动创建默认配置（pay_day=10, offsets=[0,7,14,21]）。
 */

import { Hono } from 'hono';
import { UserConfigUpdateSchema } from '@cfp/shared';
import type { Env } from '../index';

const USER_ID = 'default';

export const configRoute = new Hono<{ Bindings: Env }>();

// 获取配置
configRoute.get('/', async (c) => {
  const db = c.env.DB;
  let row = await db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(USER_ID).first<any>();

  if (!row) {
    // 首次访问：创建默认配置
    const now = Date.now();
    await db
      .prepare('INSERT INTO user_config (user_id, pay_day, snapshot_offsets, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(USER_ID, 10, '[0,7,14,21]', now, now)
      .run();
    row = await db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(USER_ID).first<any>();
  }

  return c.json({
    user_id: row!.user_id,
    pay_day: row!.pay_day,
    snapshot_offsets: JSON.parse(row!.snapshot_offsets),
    created_at: row!.created_at,
    updated_at: row!.updated_at,
  });
});

// 更新配置
configRoute.put('/', async (c) => {
  const body = await c.req.json();
  const parsed = UserConfigUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const now = Date.now();
  const current = await c.env.DB.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(USER_ID).first<any>();

  if (!current) {
    await c.env.DB
      .prepare('INSERT INTO user_config (user_id, pay_day, snapshot_offsets, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(USER_ID, parsed.data.pay_day ?? 10, JSON.stringify(parsed.data.snapshot_offsets ?? [0, 7, 14, 21]), now, now)
      .run();
  } else {
    const updates: string[] = [];
    const values: any[] = [];
    if (parsed.data.pay_day !== undefined) {
      updates.push('pay_day = ?');
      values.push(parsed.data.pay_day);
    }
    if (parsed.data.snapshot_offsets !== undefined) {
      updates.push('snapshot_offsets = ?');
      values.push(JSON.stringify(parsed.data.snapshot_offsets));
    }
    updates.push('updated_at = ?');
    values.push(now);
    values.push(USER_ID);
    await c.env.DB.prepare(`UPDATE user_config SET ${updates.join(', ')} WHERE user_id = ?`).bind(...values).run();
  }

  return c.json({ ok: true });
});