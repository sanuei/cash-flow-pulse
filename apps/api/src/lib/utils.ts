/**
 * 通用工具函数
 *
 * v1.0: USER_ID 常量已删除。user_id 改为从 session 拿（c.get('user').id）。
 */

export function generateId(): string {
  // Cloudflare Workers 原生 crypto.randomUUID()
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}