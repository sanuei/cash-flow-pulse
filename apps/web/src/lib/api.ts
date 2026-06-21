/**
 * API 客户端（fetch 封装）
 *
 * dev 环境：相对路径 /api → Vite proxy 转发到 http://localhost:8787
 * prod 环境：硬编码 Workers API 跨域（不依赖同源 /api 路由）
 *
 * 为什么不用相对路径：
 * - 之前用 /api 依赖 soniclab-router 反向代理，但 router 部署有路由冲突
 * - 自定义域名（cashflow.soniclab.cc）下 /api 走到 Pages SPA fallback 返回 HTML
 * - 改为直接打 Workers API（*.workers.dev），所有自定义域名都通用，无需重新 build
 *
 * 配置：
 * - 开发：VITE_API_BASE=/api（vite proxy 转发）
 * - 生产：硬编码 PRODUCTION_API_BASE（注入 .env.production 也可，但当前 build 时已知）
 */

const PRODUCTION_API_BASE = 'https://cash-flow-pulse-api.sonic980828.workers.dev/api';

// 根据 hostname 决定 API base：
// - localhost → 相对路径（Vite proxy 转发到 8787）
// - 其他 → Workers API 跨域
function resolveApiBase(): string {
  if (typeof window === 'undefined') {
    // SSR / build 阶段
    return import.meta.env.VITE_API_BASE || '/api';
  }
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return import.meta.env.VITE_API_BASE || '/api';
  }
  // 生产环境：直接打 Workers API
  return PRODUCTION_API_BASE;
}

const API_BASE = resolveApiBase();

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