/**
 * Google OAuth 2.0 + Session 管理
 *
 * v1.0 重构：从单用户 → 多用户
 * - 替代 lib/utils.ts 里的 USER_ID 常量
 * - 替代 export-import 里的硬编码 'default'
 *
 * 流程：
 *   1. /api/auth/google        → 302 跳 Google consent screen
 *   2. /api/auth/callback/google?code=&state=
 *      → 用 code 换 access_token + id_token
 *      → JWT verify id_token（验签 + aud + iss）
 *      → UPSERT users 表
 *      → 执行数据迁移 hook（'default' → 真实 user_id）
 *      → 创建 session（30 天过期）
 *      → Set-Cookie cfp_session
 *      → 302 回首页
 *   3. 后续请求带 cookie → requireAuth middleware 验 session → 挂 user 到 ctx
 */

import type { Context, Next } from 'hono';
import type { Env } from '../index';
import { generateId, now } from './utils';

// ========================================================================
// 类型
// ========================================================================

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_token?: string;
  token_type: string;
  scope: string;
}

export interface GoogleIdTokenPayload {
  iss: string;            // 'https://accounts.google.com'
  azp: string;            // OAuth client_id
  aud: string;            // OAuth client_id（同上）
  sub: string;            // Google unique user ID
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  iat: number;
  exp: number;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  provider: string;
  provider_sub: string;
  tier: 'free' | 'pro';
  stripe_customer_id: string | null;
  is_admin: number;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

// ========================================================================
// 配置
// ========================================================================

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const SESSION_COOKIE = 'cfp_session';
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

const STATE_TTL_MIN = 10; // state 必须 10 分钟内用完，防 CSRF
const STATE_SEP = '~'; // HMAC state 分隔符（nonce/exp/sig 均为 hex/数字，不含此字符）

// 创始用户邮箱（迁移 + 永久 pro + 绕过限流）。后续如要真正开放注册，把这行删掉。
export const FOUNDER_EMAIL = 'sonic980828@gmail.com';

// ========================================================================
// JWT 验证（Google id_token）
// ========================================================================

/** Google JWT header → kid → 从 JWKS 取公钥 → 验签 */
async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<GoogleIdTokenPayload> {
  // 1. 解析 header 拿 kid
  const parts1 = idToken.split('.');
  if (parts1.length !== 3) throw new Error('Malformed JWT: expected 3 parts');
  const [headerB64] = parts1;
  const header = JSON.parse(atob(headerB64!.replace(/-/g, '+').replace(/_/g, '/'))) as { kid: string; alg: string };
  if (header.alg !== 'RS256') throw new Error(`Unexpected alg: ${header.alg}`);

  // 2. 拉 Google 公钥（每次都拉，简单起见不缓存；如要优化可加 KV 缓存）
  const certsRes = await fetch(GOOGLE_CERTS_URL);
  const certs = (await certsRes.json()) as { keys: Array<{ kid: string; n: string; e: string }> };
  const key = certs.keys.find((k) => k.kid === header.kid);
  if (!key) throw new Error(`kid not found: ${header.kid}`);

  // 3. 导入公钥
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: key.n, e: key.e, alg: 'RS256', use: 'sig' },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // 4. 验签
  const parts2 = idToken.split('.');
  if (parts2.length !== 3) throw new Error('Malformed JWT: expected 3 parts');
  const [headerB, payloadB, sigB] = parts2;
  if (!headerB || !payloadB || !sigB) throw new Error('Malformed JWT: missing parts');
  const data = new TextEncoder().encode(`${headerB}.${payloadB}`);
  // base64url → base64 → binary
  const sig = base64UrlToBytes(sigB);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sig, data);
  if (!valid) throw new Error('Invalid JWT signature');

  // 5. 验 claims
  const payload = JSON.parse(atob(payloadB.replace(/-/g, '+').replace(/_/g, '/'))) as GoogleIdTokenPayload;
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    throw new Error(`Invalid issuer: ${payload.iss}`);
  }
  if (payload.aud !== clientId) throw new Error(`Invalid audience: ${payload.aud}`);
  if (payload.exp * 1000 < Date.now()) throw new Error('Token expired');

  return payload;
}

function base64UrlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - (s.length % 4)) % 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ========================================================================
// OAuth Flow
// ========================================================================

// ========================================================================
// HMAC 签名 state（无 cookie 依赖，解决 iOS PWA/Safari 跨 cookie-jar 问题）
//
// 老方案: state 存 cookie → iOS standalone PWA 打开 Google 时切换到 Safari，
//   Safari 拿不到 PWA WKWebView 里的 state cookie → state_mismatch 登录失败。
// 新方案: state = nonce~exp~HMAC(secret, nonce~exp)，纯 URL 参数传递，无 cookie。
// ========================================================================

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function buildSignedState(secret: string): Promise<string> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const exp = (Date.now() + STATE_TTL_MIN * 60 * 1000).toString();
  const payload = `${nonce}${STATE_SEP}${exp}`;
  const sig = await hmacHex(secret, payload);
  return `${payload}${STATE_SEP}${sig}`;
}

async function verifySignedState(state: string, secret: string): Promise<boolean> {
  const parts = state.split(STATE_SEP);
  if (parts.length !== 3) return false;
  const [nonce, expStr, sig] = parts as [string, string, string];
  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || Date.now() > exp) return false;
  const expected = await hmacHex(secret, `${nonce}${STATE_SEP}${expStr}`);
  // 常数时间比较（防时序攻击）
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/**
 * Step 1: 生成 HMAC 签名 state，302 跳 Google consent（无 cookie）
 */
export async function buildGoogleAuthUrl(env: Env, redirectUri: string): Promise<{ url: string }> {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID/SECRET not configured');

  const state = await buildSignedState(clientSecret);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    state,
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  return { url: `${GOOGLE_AUTHORIZE_URL}?${params}` };
}

/**
 * Step 1.5: 验证回调 state（替代 consumeStateFromCookie）
 */
export async function verifyCallbackState(state: string, env: Env): Promise<boolean> {
  return verifySignedState(state, env.GOOGLE_CLIENT_SECRET);
}

/**
 * Step 2: code → tokens → user
 */
export async function exchangeCodeForUser(
  env: Env,
  code: string,
  redirectUri: string
): Promise<GoogleIdTokenPayload> {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth not configured');

  // 1. code → tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${tokenRes.status} ${err}`);
  }
  const tokens = (await tokenRes.json()) as GoogleTokenResponse;

  // 2. 验 id_token
  return await verifyGoogleIdToken(tokens.id_token, clientId);
}

// ========================================================================
// User CRUD
// ========================================================================

/**
 * UPSERT 用户。返回 user row（含 is_admin 标记）。
 * - 新用户：插入，tier='free'
 * - 老用户：更新 last_login_at
 * - 如果邮箱匹配 FOUNDER_EMAIL：标记 is_admin=1 + tier='pro'（永久）
 */
export async function upsertUser(env: Env, payload: GoogleIdTokenPayload): Promise<User> {
  const db = env.DB;
  const ts = now();
  const isFounder = payload.email.toLowerCase() === FOUNDER_EMAIL.toLowerCase();

  // 尝试更新（如果已存在）
  const existing = await db
    .prepare('SELECT * FROM users WHERE provider = ? AND provider_sub = ?')
    .bind('google', payload.sub)
    .first<User>();

  if (existing) {
    await db
      .prepare(`UPDATE users SET
        email = ?, name = ?, picture = ?, last_login_at = ?, updated_at = ?,
        is_admin = CASE WHEN ? THEN 1 ELSE is_admin END,
        tier = CASE WHEN ? THEN 'pro' ELSE tier END
        WHERE id = ?`)
      .bind(payload.email, payload.name ?? null, payload.picture ?? null, ts, ts,
            isFounder ? 1 : 0, isFounder ? 1 : 0, existing.id)
      .run();
    return { ...existing, last_login_at: ts, updated_at: ts,
             is_admin: isFounder ? 1 : existing.is_admin,
             tier: isFounder ? 'pro' : existing.tier,
             name: payload.name ?? existing.name,
             picture: payload.picture ?? existing.picture,
             email: payload.email };
  }

  // 新用户
  const id = generateId();
  await db
    .prepare(`INSERT INTO users
      (id, email, name, picture, provider, provider_sub, tier, stripe_customer_id, is_admin, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, 'google', ?, ?, NULL, ?, ?, ?, ?)`)
    .bind(id, payload.email, payload.name ?? null, payload.picture ?? null, payload.sub,
          isFounder ? 'pro' : 'free',
          isFounder ? 1 : 0,
          ts, ts, ts)
    .run();

  return {
    id, email: payload.email, name: payload.name ?? null, picture: payload.picture ?? null,
    provider: 'google', provider_sub: payload.sub,
    tier: isFounder ? 'pro' : 'free', stripe_customer_id: null,
    is_admin: isFounder ? 1 : 0,
    created_at: ts, updated_at: ts, last_login_at: ts,
  };
}

/**
 * 数据迁移 hook：'default' 数据 → 真实 user_id
 * 只迁移一次（用 sentinel：检查 users 表里有任何 user 之外的 default 数据）
 */
export async function migrateDefaultDataToUser(env: Env, userId: string): Promise<{ migrated: boolean; counts: Record<string, number> }> {
  const db = env.DB;
  const counts: Record<string, number> = {};
  const tables = ['cash_sources', 'credit_cards', 'snapshots', 'recurring_investments', 'recurring_bills', 'recurring_incomes', 'subscriptions', 'user_config'];

  // 检查是否有 default 数据
  const sample = await db.prepare('SELECT COUNT(*) as c FROM cash_sources WHERE user_id = ?').bind('default').first<{c: number}>();
  if (!sample || sample.c === 0) {
    return { migrated: false, counts };
  }

  // 执行迁移（注意 user_config.user_id 是 PRIMARY KEY，要 INSERT OR REPLACE 而不是 UPDATE）
  for (const t of tables) {
    if (t === 'user_config') {
      // 特殊处理：user_config.user_id 是 PRIMARY KEY
      // 把 'default' 行的所有字段复制到新 user_id，然后删 'default' 行
      const row = await db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind('default').first<any>();
      if (row) {
        await db
          .prepare(`INSERT OR REPLACE INTO user_config
            (user_id, pay_day, snapshot_offsets, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)`)
          .bind(userId, row.pay_day, row.snapshot_offsets, row.created_at, row.updated_at)
          .run();
        await db.prepare('DELETE FROM user_config WHERE user_id = ?').bind('default').run();
        counts[t] = 1;
      }
    } else {
      const res = await db
        .prepare(`UPDATE ${t} SET user_id = ? WHERE user_id = 'default'`)
        .bind(userId)
        .run();
      counts[t] = (res as any).changes ?? 0;
    }
  }

  return { migrated: true, counts };
}

// ========================================================================
// Session 管理
// ========================================================================

export async function createSession(env: Env, userId: string, req: Request): Promise<{ id: string; expiresAt: number }> {
  const id = generateId();
  const ts = now();
  const expiresAt = ts + SESSION_TTL_MS;
  const ip = req.headers.get('cf-connecting-ip') ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;

  await env.DB
    .prepare(`INSERT INTO sessions (id, user_id, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, userId, expiresAt, ts, ip, userAgent)
    .run();

  return { id, expiresAt };
}

export async function getSession(env: Env, sessionId: string): Promise<{ user: User; sessionId: string } | null> {
  const db = env.DB;
  const session = await db
    .prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
    .bind(sessionId, now())
    .first<{ id: string; user_id: string; expires_at: number }>();

  if (!session) return null;

  const user = await db
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(session.user_id)
    .first<User>();

  if (!user) return null;

  return { user, sessionId: session.id };
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

export async function cleanExpiredSessions(env: Env): Promise<number> {
  const res = await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()).run();
  return (res as any).changes ?? 0;
}

// ========================================================================
// Cookie 工具
// ========================================================================

export function buildSessionCookie(sessionId: string, expiresAt: number, secure: boolean): string {
  const expires = new Date(expiresAt).toUTCString();
  const flags = [
    `${SESSION_COOKIE}=${sessionId}`,
    'Path=/',
    'HttpOnly',
    // 跨域 cookie 必须 None + Secure；Secure 只在 https 下设
    // Lax 在跨站 cookie（不同域名）会被拒绝
    'SameSite=None',
    `Expires=${expires}`,
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function buildClearSessionCookie(secure: boolean): string {
  const flags = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=None',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function readSessionIdFromCookie(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const c of cookies) {
    if (c.startsWith(`${SESSION_COOKIE}=`)) {
      return c.substring(SESSION_COOKIE.length + 1);
    }
  }
  return null;
}

// ========================================================================
// State 工具已迁移至 HMAC 签名方案（buildGoogleAuthUrl / verifyCallbackState），
// 不再需要 cookie-based state 函数。

// ========================================================================
// Middleware: requireAuth
// ========================================================================

declare module 'hono' {
  interface ContextVariableMap {
    user: User;
    sessionId: string;
  }
}

/**
 * 用法：
 *   app.use('/api/*', requireAuth);
 *   app.get('/api/cash', (c) => c.get('user').id);
 *
 * 排除路由（不需要 auth，自己处理）：
 *   - /api/auth/google         (OAuth 起点)
 *   - /api/auth/callback/google (OAuth 回调)
 *   - /api/auth/logout          (注销)
 *   - /api/health               (健康检查)
 *
 * /api/auth/me 不在此排除列表 — 需要 auth 才能返回 user 信息
 */
export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  // 跳过 OAuth 流程路由（自己处理认证）
  // 但 /api/auth/me 需要 user，所以不过滤
  const path = c.req.path;
  if (
    path === '/api/auth/google' ||
    path === '/api/auth/callback/google' ||
    path === '/api/auth/logout' ||
    path === '/api/health'
  ) {
    return next();
  }

  const sessionId = readSessionIdFromCookie(c.req.raw);
  if (!sessionId) {
    return c.json({ error: 'unauthorized', message: 'No session cookie' }, 401);
  }

  const session = await getSession(c.env, sessionId);
  if (!session) {
    // Cookie 失效（过期 / 被吊销）→ 清掉
    return new Response(JSON.stringify({ error: 'session_expired' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildClearSessionCookie(c.req.url.startsWith('https://')),
      },
    });
  }

  c.set('user', session.user);
  c.set('sessionId', session.sessionId);
  await next();
}

// ========================================================================
// Helper: 备查（Hono/D1 直接用 env.DB.prepare().bind()，无需包装）
// ========================================================================