/**
 * 持仓路由（/api/holdings）—— 「其他资产」下的股票/基金持仓，按行情自动估值
 *
 * GET    /                 本人全部持仓 + 用到的行情（含汇率）
 * GET    /search?kind&q    搜索代码（market: Yahoo；cn_fund: 天天基金）
 * GET    /lookup?kind&symbol  按代码取一次行情（添加前确认名称和价格）
 * POST   /                 添加持仓（先抓行情校验代码，再写入，并重算所属资产价值）
 * PUT    /:id              改数量 / 名称 / 配置类别
 * DELETE /:id
 * POST   /refresh          手动刷新本人持仓行情
 */
import { Hono } from 'hono';
import { HoldingInputSchema, HoldingUpdateSchema, quoteKey, type Quote, type HoldingKind } from '@cfp/shared';
import type { Env } from '../index';
import { generateId, now } from '../lib/utils';
import {
  normalizeSymbol, upsertQuote, refreshHoldings, revalueAssets, searchMarket, searchCnFunds, fxRates, fetchQuote,
} from '../lib/quotes';

export const holdingRoutes = new Hono<{ Bindings: Env }>();

async function userQuotes(db: D1Database, userId: string) {
  const rows = await db.prepare(
    `SELECT q.* FROM quotes q
     WHERE (q.kind, q.symbol) IN (SELECT DISTINCT kind, symbol FROM holdings WHERE user_id = ? AND kind != 'manual')
        OR q.kind = 'fx'`,
  ).bind(userId).all<Quote>();
  return rows.results || [];
}

holdingRoutes.get('/', async (c) => {
  const userId = c.get('user')!.id;
  const [holdings, quotes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM holdings WHERE user_id = ? ORDER BY asset_id, sort_order, created_at').bind(userId).all<any>(),
    userQuotes(c.env.DB, userId),
  ]);
  return c.json({
    holdings: holdings.results || [],
    quotes,
    fx: fxRates(new Map(quotes.map((q) => [quoteKey(q.kind, q.symbol), q]))),
  });
});

holdingRoutes.get('/search', async (c) => {
  const kind = c.req.query('kind');
  const q = (c.req.query('q') || '').trim();
  if (q.length < 1) return c.json({ results: [] });
  try {
    if (kind === 'market') return c.json({ results: await searchMarket(q) });
    if (kind === 'cn_fund') return c.json({ results: await searchCnFunds(q) });
    return c.json({ results: [] });
  } catch (e: any) {
    return c.json({ error: `搜索失败：${e?.message || e}` }, 502);
  }
});

holdingRoutes.get('/lookup', async (c) => {
  const kind = c.req.query('kind') as HoldingKind;
  let symbol: string;
  try { symbol = normalizeSymbol(kind, c.req.query('symbol') || ''); }
  catch (e: any) { return c.json({ error: e.message }, 400); }
  try {
    const q = await fetchQuote(kind, symbol);
    return c.json({ symbol, ...q });
  } catch (e: any) {
    return c.json({ error: `没有找到「${symbol}」：${e?.message || e}` }, 404);
  }
});

holdingRoutes.post('/', async (c) => {
  const userId = c.get('user')!.id;
  const parsed = HoldingInputSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  const db = c.env.DB;

  const asset = await db.prepare('SELECT id FROM other_assets WHERE id = ? AND user_id = ?').bind(d.asset_id, userId).first();
  if (!asset) return c.json({ error: '资产不存在' }, 404);

  let symbol = '';
  let name = (d.name ?? '').trim();
  if (d.kind === 'manual') {
    if (!name) return c.json({ error: '请填写名称（如「账户现金」）' }, 400);
  } else {
    try { symbol = normalizeSymbol(d.kind, d.symbol); }
    catch (e: any) { return c.json({ error: e.message }, 400); }
    // 先抓一次行情：代码不对就直接报错，不写入
    const prev = await db.prepare('SELECT * FROM quotes WHERE kind = ? AND symbol = ?').bind(d.kind, symbol).first<Quote>();
    const q = await upsertQuote(db, d.kind, symbol, prev ?? undefined);
    if (q.price == null) return c.json({ error: `没有找到「${symbol}」的行情：${q.error ?? '未知错误'}` }, 400);
    name = q.name || name || symbol;
    if (q.currency && q.currency !== 'JPY') {
      const fxSym = `${q.currency}JPY=X`;
      const fxPrev = await db.prepare("SELECT * FROM quotes WHERE kind = 'fx' AND symbol = ?").bind(fxSym).first<Quote>();
      if (!fxPrev || Date.now() - fxPrev.fetched_at > 3600_000) await upsertQuote(db, 'fx', fxSym, fxPrev ?? undefined);
    }
  }

  const id = generateId();
  const ts = now();
  const maxOrder = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM holdings WHERE asset_id = ?').bind(d.asset_id).first<any>();
  await db.prepare(
    `INSERT INTO holdings (id, user_id, asset_id, kind, symbol, name, quantity, bucket, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, userId, d.asset_id, d.kind, symbol, name, d.quantity, d.bucket ?? null, (maxOrder?.m ?? -1) + 1, ts, ts).run();
  await revalueAssets(db, undefined, undefined, d.asset_id);
  return c.json({ id, user_id: userId, asset_id: d.asset_id, kind: d.kind, symbol, name, quantity: d.quantity, bucket: d.bucket ?? null }, 201);
});

holdingRoutes.put('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const parsed = HoldingUpdateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  const row = await c.env.DB.prepare('SELECT asset_id FROM holdings WHERE id = ? AND user_id = ?').bind(id, userId).first<any>();
  if (!row) return c.json({ error: 'Not Found' }, 404);

  const updates: string[] = [];
  const values: any[] = [];
  if (parsed.data.quantity !== undefined) { updates.push('quantity = ?'); values.push(parsed.data.quantity); }
  if (parsed.data.name !== undefined) { updates.push('name = ?'); values.push(parsed.data.name); }
  if (parsed.data.bucket !== undefined) { updates.push('bucket = ?'); values.push(parsed.data.bucket); }
  updates.push('updated_at = ?'); values.push(now());
  await c.env.DB.prepare(`UPDATE holdings SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).bind(...values, id, userId).run();
  await revalueAssets(c.env.DB, undefined, undefined, row.asset_id);
  return c.json({ ok: true });
});

holdingRoutes.delete('/:id', async (c) => {
  const userId = c.get('user')!.id;
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT asset_id FROM holdings WHERE id = ? AND user_id = ?').bind(id, userId).first<any>();
  if (!row) return c.json({ error: 'Not Found' }, 404);
  await c.env.DB.prepare('DELETE FROM holdings WHERE id = ? AND user_id = ?').bind(id, userId).run();
  // 删到一个不剩时保留资产当前价值（变回手动估值）
  await revalueAssets(c.env.DB, undefined, undefined, row.asset_id);
  return c.json({ ok: true });
});

holdingRoutes.post('/refresh', async (c) => {
  const userId = c.get('user')!.id;
  const r = await refreshHoldings(c.env.DB, { userId, force: true });
  return c.json({ ok: true, ...r });
});

/**
 * 资产走势（首页图表）：每日 现金 / 投资 / 其他。
 * asset_history 开始记录之前的日子，用每日快照里的现金余额补上（那时没有投资记录 → invest/other 为 null）。
 */
holdingRoutes.get('/history', async (c) => {
  const userId = c.get('user')!.id;
  const days = Math.min(3650, Math.max(7, parseInt(c.req.query('days') || '365') || 365));
  const since = new Date(Date.now() + 9 * 3600_000 - days * 86400_000).toISOString().slice(0, 10);
  const [hist, snaps] = await Promise.all([
    c.env.DB.prepare('SELECT date, cash, invest, other FROM asset_history WHERE user_id = ? AND date >= ? ORDER BY date')
      .bind(userId, since).all<{ date: string; cash: number; invest: number; other: number }>(),
    c.env.DB.prepare('SELECT snapshot_date AS date, total_balance AS cash FROM snapshots WHERE user_id = ? AND snapshot_date >= ? ORDER BY snapshot_date')
      .bind(userId, since).all<{ date: string; cash: number }>(),
  ]);
  const recorded = hist.results || [];
  const firstRecorded = recorded[0]?.date ?? '9999-12-31';
  const backfill = (snaps.results || [])
    .filter((s) => s.date < firstRecorded)
    .map((s) => ({ date: s.date, cash: s.cash, invest: null as number | null, other: null as number | null }));
  return c.json({ points: [...backfill, ...recorded], recorded_since: recorded[0]?.date ?? null });
});
