/**
 * API 客户端（fetch 封装）
 *
 * dev 环境：相对路径 /api → Vite proxy 转发到 http://localhost:8787
 * prod 环境：从 .env.production 读 VITE_API_BASE（如 https://xxx.workers.dev/api）
 *
 * 配置方式：
 * - 开发：在 apps/web/.env.development 里不写，走相对路径
 * - 生产：在 apps/web/.env.production 里写 VITE_API_BASE=https://xxx.workers.dev/api
 *   （CD 时由 CI/脚本注入）
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(`API ${status}: ${message}`);
  }
}