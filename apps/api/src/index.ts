/**
 * Cash Flow Pulse - API Server
 *
 * Cloudflare Workers + D1 后端。
 * 用 Hono 作为路由框架（轻量 + TS 类型友好）。
 *
 * v1.0 新增 Google OAuth + 多用户
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { configRoute } from './routes/config';
import { cashRoutes } from './routes/cash';
import { cardRoutes } from './routes/cards';
import { snapshotRoutes } from './routes/snapshots';
import { dashboardRoute } from './routes/dashboard';
import { exportImportRoutes } from './routes/export-import';
// v0.3 新增
import { investmentRoutes } from './routes/investments';
import { billRoutes } from './routes/bills';
import { incomeRoutes } from './routes/incomes';
import { subscriptionRoutes } from './routes/subscriptions';
// v1.0 新增
import { authRoutes } from './routes/auth';
import { requireAuth } from './lib/auth';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  APP_URL: string;  // 前端 Web App 地址，OAuth 登录后跳回用（生产：https://cashflow.soniclab.cc）
  // Google OAuth (v1.0+)
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  // Stripe (v1.0+ 第二阶段)
  // STRIPE_SECRET_KEY: string;
  // STRIPE_WEBHOOK_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS 配置：开发时允许 localhost:5173，生产时配白名单
app.use('*', async (c, next) => {
  const origin = c.env.ALLOWED_ORIGIN || 'http://localhost:5173';
  return cors({
    origin: origin.split(','),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    credentials: true,  // v1.0+ 允许 cookie
  })(c, next);
});

// 健康检查（不需要 auth，注册在 requireAuth 之前，由注册顺序自然跳过）
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// 认证中间件必须在所有 /api/* 路由之前注册，否则 Hono 会先命中路由返回响应，中间件永远不会执行
// requireAuth 内部白名单已跳过 /api/auth/google、/callback/google、/logout
app.use('/api/*', requireAuth);

// Auth 路由（requireAuth 内白名单保证 google/callback/logout 不需要 session）
app.route('/api/auth', authRoutes);

// 业务路由
app.route('/api/config', configRoute);
app.route('/api/cash', cashRoutes);
app.route('/api/cards', cardRoutes);
app.route('/api/snapshots', snapshotRoutes);
app.route('/api/dashboard', dashboardRoute);
app.route('/api', exportImportRoutes);
// v0.3 新增
app.route('/api/investments', investmentRoutes);
app.route('/api/bills', billRoutes);
app.route('/api/incomes', incomeRoutes);
app.route('/api/subscriptions', subscriptionRoutes);

// 404
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// 错误处理
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
});

// ============================================================
// Cron：每日自动快照（每天 UTC 15:00 = 日本时间 0:00）
// ============================================================

async function runDailySnapshot(env: Env): Promise<void> {
  const { computeDashboardV2, getCurrentCycle, formatDate } = await import('@cfp/shared');
  const { generateId } = await import('./lib/utils');

  const today = new Date();
  const todayStr = formatDate(today);

  // 遍历所有用户
  const users = await env.DB.prepare('SELECT id FROM users').all<{ id: string }>();
  for (const user of (users.results || [])) {
    const userId = user.id;
    try {
      const [cashRows, cardRows, investmentRows, billRows, incomeRows, subscriptionRows, config] = await Promise.all([
        env.DB.prepare('SELECT * FROM cash_sources WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
        env.DB.prepare('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
        env.DB.prepare('SELECT * FROM recurring_investments WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
        env.DB.prepare('SELECT * FROM recurring_bills WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
        env.DB.prepare('SELECT * FROM recurring_incomes WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
        env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY sort_order').bind(userId).all<any>(),
        env.DB.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(userId).first<any>(),
      ]);
      if (!config) continue;

      const userConfig = {
        user_id: userId,
        pay_day: config.pay_day,
        snapshot_offsets: JSON.parse(config.snapshot_offsets),
        weekend_shift: !!config.weekend_shift,
        created_at: config.created_at,
        updated_at: config.updated_at,
      };
      const calc = computeDashboardV2(
        today, userConfig,
        cashRows.results || [], cardRows.results || [], [],
        investmentRows.results || [], billRows.results || [],
        incomeRows.results || [], subscriptionRows.results || [],
      );
      const cycle = getCurrentCycle(today, userConfig.pay_day);
      const totalInvestment = calc.upcoming_expenses
        ? calc.upcoming_expenses.total_investments
        : 0;

      const id = generateId();
      const ts = Date.now();
      await env.DB
        .prepare(`INSERT INTO snapshots
          (id, user_id, cycle_id, offset_index, snapshot_date,
           total_balance, total_locked, total_due, net_available, daily_budget,
           days_to_payday, note, data_unchanged,
           total_income, total_investment, total_expense, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,0,?,?,?,?)
          ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
            cycle_id=excluded.cycle_id,
            total_balance=excluded.total_balance, total_locked=excluded.total_locked,
            total_due=excluded.total_due, net_available=excluded.net_available,
            daily_budget=excluded.daily_budget, days_to_payday=excluded.days_to_payday,
            total_income=excluded.total_income, total_investment=excluded.total_investment,
            total_expense=excluded.total_expense, created_at=excluded.created_at`)
        .bind(
          id, userId, cycle.cycle_id, 0, todayStr,
          calc.total_balance, calc.total_locked, calc.total_due,
          calc.net_available, calc.daily_budget, calc.days_to_payday,
          calc.total_income, totalInvestment, calc.total_expense, ts
        )
        .run();
    } catch (e) {
      console.error(`[cron] snapshot failed for user ${userId}:`, e);
    }
  }
  console.log(`[cron] daily snapshot done: ${todayStr}, ${users.results?.length ?? 0} users`);
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailySnapshot(env));
  },
};