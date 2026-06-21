/**
 * Auth 路由：/api/auth/google + /api/auth/callback/google + /api/auth/logout + /api/auth/me
 *
 * v1.0 新增
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import {
  buildGoogleAuthUrl,
  buildSessionCookie,
  buildClearSessionCookie,
  buildStateCookie,
  buildClearStateCookie,
  consumeStateFromCookie,
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
 * 跳 Google consent screen
 */
authRoutes.get('/google', (c) => {
  // redirect_uri 必须跟 Google Console 配的一致
  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/api/auth/callback/google`;

  const { url, state } = buildGoogleAuthUrl(c.env, redirectUri);

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Set-Cookie': buildStateCookie(state, c.req.url.startsWith('https://')),
    },
  });
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
    return c.redirect(`/?auth_error=${encodeURIComponent(errorParam)}`, 302);
  }

  if (!code || !state) {
    return c.json({ error: 'missing_code_or_state' }, 400);
  }

  // CSRF 检查：state 必须匹配 cookie
  const cookieState = consumeStateFromCookie(c.req.raw);
  if (!cookieState || cookieState !== state) {
    return c.json({ error: 'state_mismatch', message: 'Possible CSRF attack' }, 400);
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

    // 5. 302 回首页（带 session cookie + 清掉 state cookie）
    const isSecure = c.req.url.startsWith('https://');
    const sessionCookie = buildSessionCookie(sessionId, expiresAt, isSecure);
    const clearStateCookie = buildClearStateCookie(isSecure);
    // Cloudflare Workers 不支持单 header 多 cookie 用 \n 合并，必须 append 多次
    const headers = new Headers();
    headers.set('Location', migration.migrated ? '/?welcome=migrated' : '/');
    headers.append('Set-Cookie', sessionCookie);
    headers.append('Set-Cookie', clearStateCookie);
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