/**
 * 通用工具函数
 */

export function generateId(): string {
  // Cloudflare Workers 原生 crypto.randomUUID()
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}

export const USER_ID = 'default';