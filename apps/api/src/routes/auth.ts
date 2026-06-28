/**
 * Auth 路由：/api/auth/google + /api/auth/callback/google + /api/auth/logout + /api/auth/me
 *
 * v1.0 新增
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import {
  buildGoogleAuthUrl,
  verifyCallbackState,
  buildSessionCookie,
  buildClearSessionCookie,
  exchangeCodeForUser,
  upsertUser,
  migrateDefaultDataToUser,
  createSession,
  deleteSession,
  readSessionIdFromCookie,
} from '../lib/auth';

export const authRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /api/auth/google
 * 跳 Google consent screen（state 用 HMAC 签名，不依赖 cookie，修复 iOS PWA/Safari 跨 jar 问题）
 */
authRoutes.get('/google', async (c) => {
  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/api/auth/callback/google`;
  const { url } = await buildGoogleAuthUrl(c.env, redirectUri);
  return new Response(null, { status: 302, headers: { Location: url } });
});

/**
 * GET /api/auth/callback/google?code=&state=
 * Google 回调：code → user → session → 跳回首页
 */
authRoutes.get('/callback/google', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const errorParam = c.req.query('error');

  // 错误回调（用户拒绝授权等）
  if (errorParam) {
    const appUrl = c.env.APP_URL || 'https://cashflow.soniclab.cc';
    return c.redirect(`${appUrl}/?auth_error=${encodeURIComponent(errorParam)}`, 302);
  }

  if (!code || !state) {
    return c.json({ error: 'missing_code_or_state' }, 400);
  }

  // CSRF 检查：验证 HMAC 签名 state（不依赖 cookie）
  const stateValid = await verifyCallbackState(state, c.env);
  if (!stateValid) {
    return c.json({ error: 'state_invalid', message: 'State expired or tampered' }, 400);
  }

  try {
    const origin = new URL(c.req.url).origin;
    const redirectUri = `${origin}/api/auth/callback/google`;

    // 1. code → user payload（已验签 + 验 aud）
    const payload = await exchangeCodeForUser(c.env, code, redirectUri);

    // 2. UPSERT users 表
    const user = await upsertUser(c.env, payload);

    // 3. 迁移 hook：把 'default' 数据搬过来（如果有）
    const migration = await migrateDefaultDataToUser(c.env, user.id);

    // 4. 创建 session
    const { id: sessionId, expiresAt } = await createSession(c.env, user.id, c.req.raw);

    // 5. 302 回前端首页（带 session cookie）
    const isSecure = c.req.url.startsWith('https://');
    const sessionCookie = buildSessionCookie(sessionId, expiresAt, isSecure);
    const headers = new Headers();
    const appUrl = c.env.APP_URL || 'https://cashflow.soniclab.cc';
    // ?cfp_auth=1 让前端 checkSession 在 visibilitychange 时重试（iOS PWA/Safari 场景）
    const dest = migration.migrated ? `${appUrl}/?welcome=migrated` : `${appUrl}/?cfp_auth=1`;
    headers.set('Location', dest);
    headers.append('Set-Cookie', sessionCookie);
    return new Response(null, { status: 302, headers });
  } catch (err: any) {
    console.error('OAuth callback error:', err);
    return c.json({ error: 'oauth_failed', message: err.message }, 500);
  }
});

/**
 * POST /api/auth/logout
 * 注销：删 session + 清 cookie
 */
authRoutes.post('/logout', async (c) => {
  const sessionId = readSessionIdFromCookie(c.req.raw);
  if (sessionId) {
    await deleteSession(c.env, sessionId);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildClearSessionCookie(c.req.url.startsWith('https://')),
    },
  });
});

/**
 * GET /api/auth/sessions
 * 当前用户的所有活跃 session（用于设备管理）
 */
authRoutes.get('/sessions', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const currentSessionId = c.get('sessionId');
  const rows = await c.env.DB
    .prepare(`SELECT id, created_at, expires_at, ip, user_agent
              FROM sessions WHERE user_id = ? AND expires_at > ?
              ORDER BY created_at DESC LIMIT 10`)
    .bind(user.id, Date.now())
    .all<any>();
  const sessions = (rows.results || []).map((s: any) => ({
    id: s.id,
    is_current: s.id === currentSessionId,
    created_at: s.created_at,
    expires_at: s.expires_at,
    ip: s.ip,
    user_agent: s.user_agent,
  }));
  return c.json(sessions);
});

/**
 * DELETE /api/auth/sessions/:id
 * 吊销指定 session（远程登出某设备）
 */
authRoutes.delete('/sessions/:id', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  const result = await c.env.DB
    .prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run();
  if ((result as any).meta?.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

/**
 * GET /api/auth/me
 * 返回当前用户信息（前端初始化用）
 */
authRoutes.get('/me', (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    tier: user.tier,
    is_admin: user.is_admin === 1,
  });
});