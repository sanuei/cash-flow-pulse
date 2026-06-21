/**
 * 仪表盘一站式接口（/api/dashboard）
 *
 * 主页打开时调用一次：返回所有数据 + 实时计算结果（v0.3 V2 算法）
 *
 * v0.3 升级：
 * - 拉取 4 类新数据（investments/bills/incomes/subscriptions）
 * - 用 computeDashboardV2 替代 computeDashboard
 * - 返回 upcoming_expenses + upcoming_incomes 字段
 */

import { Hono } from 'hono';
import { computeDashboardV2 } from '@cfp/shared';
import type { Env } from '../index';
import { USER_ID } from '../lib/utils';

export const dashboardRoute = new Hono<{ Bindings: Env }>();

dashboardRoute.get('/', async (c) => {
  const db = c.env.DB;

  // 并行查询所有数据（v0.3: 8 张表 → 9 张表）
  const [
    configRow,
    cashRows,
    cardRows,
    snapshotRows,
    investmentRows,
    billRows,
    incomeRows,
    subscriptionRows,
  ] = await Promise.all([
    db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(USER_ID).first<any>(),
    db.prepare('SELECT * FROM cash_sources WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM snapshots WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT 100').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM recurring_investments WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM recurring_bills WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM recurring_incomes WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(USER_ID).all<any>(),
    db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(USER_ID).all<any>(),
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
  // V2 算法：传入所有 8 类数据
  const calc = computeDashboardV2(
    today,
    userConfig,
    cashRows.results || [],
    cardRows.results || [],
    snapshotRows.results || [],
    investmentRows.results || [],
    billRows.results || [],
    incomeRows.results || [],
    subscriptionRows.results || [],
  );

  return c.json({
    config: userConfig,
    cash_sources: cashRows.results || [],
    credit_cards: cardRows.results || [],
    investments: investmentRows.results || [],
    bills: billRows.results || [],
    incomes: incomeRows.results || [],
    subscriptions: subscriptionRows.results || [],
    calc,
    snapshots: snapshotRows.results || [],
    generated_at: Date.now(),
  });
});