/**
 * Cash Flow Pulse - API Server
 *
 * Cloudflare Workers + D1 后端。
 * 用 Hono 作为路由框架（轻量 + TS 类型友好）。
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { configRoute } from './routes/config';
import { cashRoutes } from './routes/cash';
import { cardRoutes } from './routes/cards';
import { snapshotRoutes } from './routes/snapshots';
import { dashboardRoute } from './routes/dashboard';
import { exportImportRoutes } from './routes/export-import';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS 配置：开发时允许 localhost:5173，生产时配白名单
app.use('*', async (c, next) => {
  const origin = c.env.ALLOWED_ORIGIN || 'http://localhost:5173';
  return cors({
    origin: origin.split(','),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })(c, next);
});

// 健康检查
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// 路由挂载
app.route('/api/config', configRoute);
app.route('/api/cash', cashRoutes);
app.route('/api/cards', cardRoutes);
app.route('/api/snapshots', snapshotRoutes);
app.route('/api/dashboard', dashboardRoute);
app.route('/api', exportImportRoutes);

// 404
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// 错误处理
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
});

export default app;