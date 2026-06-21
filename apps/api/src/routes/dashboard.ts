/**
 * 仪表盘一站式接口（/api/dashboard）
 *
 * 主页打开时调用一次：返回所有数据 + 实时计算结果，避免前端多次请求拼装
 */

import { Hono } from 'hono';
import { computeDashboard } from '@cfp/shared';
import type { Env } from '../index';
import { USER_ID } from '../lib/utils';

export const dashboardRoute = new Hono<{ Bindings: Env }>();

dashboardRoute.get('/', async (c) => {
  const db = c.env.DB;

  // 并行查询
  const [configRow, cashRows, cardRows, snapshotRows] = await Promise.all([
    db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(USER_ID).first<any>(),
    db.prepare('SELECT * FROM cash_sources WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM snapshots WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT 100').bind(USER_ID).all<any>(),
  ]);

  // 配置不存在则初始化
  let config = configRow;
  if (!config) {
    const now = Date.now();
    await db
      .prepare('INSERT INTO user_config (user_id, pay_day, snapshot_offsets, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(USER_ID, 10, '[0,7,14,21]', now, now)
      .run();
    config = await db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(USER_ID).first<any>();
  }

  const userConfig = {
    user_id: config!.user_id,
    pay_day: config!.pay_day,
    snapshot_offsets: JSON.parse(config!.snapshot_offsets),
    created_at: config!.created_at,
    updated_at: config!.updated_at,
  };

  const today = new Date();
  const calc = computeDashboard(
    today,
    userConfig,
    cashRows.results || [],
    cardRows.results || [],
    snapshotRows.results || [],
  );

  return c.json({
    config: userConfig,
    cash_sources: cashRows.results || [],
    credit_cards: cardRows.results || [],
    calc,
    snapshots: snapshotRows.results || [],
    prompt: calc.prompt,
    generated_at: Date.now(),
  });
});