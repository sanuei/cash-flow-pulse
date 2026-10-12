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
/** user_config.fire_settings（TEXT JSON）→ 对象；空/损坏 → null（前端用默认值） */
export function parseFireSettings(raw: unknown): {
  withdrawalRatePct: number; annualReturnPct: number; annualSpendOverride: number | null;
} | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return null;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const w = num(p.withdrawalRatePct);
    const r = num(p.annualReturnPct);
    if (w === null || r === null) return null;
    const o = num(p.annualSpendOverride);
    return { withdrawalRatePct: w, annualReturnPct: r, annualSpendOverride: o !== null && o > 0 ? o : null };
  } catch {
    return null;
  }
}
