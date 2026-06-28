/**
 * 管理员后台 API 路由（/api/admin）
 *
 * 权限: 只有 is_admin=1 的用户能访问(创始用户 sonic980828@gmail.com)
 * 鉴权: 通过 cookie session,worker.ts 已经把 user 注入了 c.env
 *
 * 提供:
 *   GET  /api/admin/users       - 列出所有用户 + 数据统计
 *   GET  /api/admin/stats       - 平台总览(总用户数 / 活跃用户 / 现金总额等)
 *   GET  /api/admin/user/:id    - 单个用户详情(数据计数)
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const adminRoutes = new Hono<{ Bindings: Env }>();

// 中间件:验证当前用户是 admin
adminRoutes.use('*', async (c, next) => {
  const user = c.get('user');
  if (!user || !user.is_admin) {
    return c.json({ error: 'Forbidden: admin only' }, 403);
  }
  await next();
});

// GET /api/admin/stats - 平台总览
adminRoutes.get('/stats', async (c) => {
  const db = c.env.DB;

  const stats = await db.batch([
    db.prepare('SELECT COUNT(*) as n FROM users'),
    db.prepare('SELECT COUNT(*) as n FROM sessions WHERE expires_at > ?').bind(Date.now()),
    db.prepare('SELECT COUNT(*) as n, SUM(balance) as total FROM cash_sources'),
    db.prepare('SELECT COUNT(*) as n FROM credit_cards'),
    db.prepare('SELECT COUNT(*) as n FROM recurring_incomes'),
    db.prepare('SELECT COUNT(*) as n FROM snapshots'),
  ]);

  const [users, sessions, cash, cards, incomes, snapshots] = stats;

  return c.json({
    users: (users as any).results[0],
    active_sessions: (sessions as any).results[0],
    cash: (cash as any).results[0],
    cards: (cards as any).results[0],
    incomes: (incomes as any).results[0],
    snapshots: (snapshots as any).results[0],
  });
});

// GET /api/admin/users - 列出所有用户 + 各自数据计数
adminRoutes.get('/users', async (c) => {
  const db = c.env.DB;

  const result = await db.batch([
    db.prepare(`
      SELECT
        u.id, u.email, u.name, u.picture, u.tier, u.is_admin,
        u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM cash_sources WHERE user_id = u.id) as cash_count,
        (SELECT COALESCE(SUM(balance), 0) FROM cash_sources WHERE user_id = u.id) as cash_total,
        (SELECT COUNT(*) FROM credit_cards WHERE user_id = u.id) as card_count,
        (SELECT COUNT(*) FROM recurring_incomes WHERE user_id = u.id) as income_count,
        (SELECT COUNT(*) FROM recurring_bills WHERE user_id = u.id) as bill_count,
        (SELECT COUNT(*) FROM subscriptions WHERE user_id = u.id) as sub_count,
        (SELECT COUNT(*) FROM recurring_investments WHERE user_id = u.id) as inv_count,
        (SELECT COUNT(*) FROM snapshots WHERE user_id = u.id) as snap_count
      FROM users u
      ORDER BY u.created_at DESC
    `),
  ]);

  return c.json({ users: (result[0] as any).results });
});

// GET /api/admin/user/:id - 单个用户详细数据计数
adminRoutes.get('/user/:id', async (c) => {
  const userId = c.req.param('id');
  const db = c.env.DB;

  const result = await db.batch([
    db.prepare('SELECT id, email, name, tier, is_admin, created_at, last_login_at FROM users WHERE id = ?').bind(userId),
    db.prepare('SELECT COUNT(*) as n, COALESCE(SUM(balance), 0) as total FROM cash_sources WHERE user_id = ?').bind(userId),
    db.prepare('SELECT COUNT(*) as n FROM credit_cards WHERE user_id = ?').bind(userId),
    db.prepare('SELECT COUNT(*) as n FROM recurring_bills WHERE user_id = ?').bind(userId),
    db.prepare('SELECT COUNT(*) as n FROM subscriptions WHERE user_id = ?').bind(userId),
    db.prepare('SELECT COUNT(*) as n FROM recurring_investments WHERE user_id = ?').bind(userId),
    db.prepare('SELECT COUNT(*) as n FROM recurring_incomes WHERE user_id = ?').bind(userId),
    db.prepare('SELECT COUNT(*) as n, MAX(snapshot_date) as last_snapshot FROM snapshots WHERE user_id = ?').bind(userId),
  ]);

  const [user, cash, cards, bills, subs, invs, incs, snaps] = result;
  if (!(user as any).results[0]) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    user: (user as any).results[0],
    stats: {
      cash: (cash as any).results[0],
      cards: (cards as any).results[0],
      bills: (bills as any).results[0],
      subscriptions: (subs as any).results[0],
      investments: (invs as any).results[0],
      incomes: (incs as any).results[0],
      snapshots: (snaps as any).results[0],
    },
  });
});
