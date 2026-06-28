/**
 * 仪表盘一站式接口（/api/dashboard）
 *
 * 主页打开时调用一次：返回所有数据 + 实时计算结果（v0.3 V2 算法）
 *
 * v0.3 升级：
 * - 拉取 4 类新数据（investments/bills/incomes/subscriptions）
 * - 用 computeDashboardV2 替代 computeDashboard
 * - 返回 upcoming_expenses + upcoming_incomes 字段
 */

import { Hono } from 'hono';
import { computeDashboardV2, addMonths, getCurrentCycle } from '@cfp/shared';
import type { Env } from '../index';

export const dashboardRoute = new Hono<{ Bindings: Env }>();

dashboardRoute.get('/', async (c) => {
  const userId = c.get('user')!.id;
  const db = c.env.DB;

  // 并行查询所有数据（v0.3: 8 张表 → 9 张表）
  const [
    configRow,
    cashRows,
    cardRows,
    snapshotRows,
    investmentRows,
    billRows,
    incomeRows,
    subscriptionRows,
  ] = await Promise.all([
    db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(userId).first<any>(),
    db.prepare('SELECT * FROM cash_sources WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
    db.prepare('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
    db.prepare('SELECT * FROM snapshots WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT 100').bind(userId).all<any>(),
    db.prepare('SELECT * FROM recurring_investments WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
    db.prepare('SELECT * FROM recurring_bills WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
    db.prepare('SELECT * FROM recurring_incomes WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
    db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
  ]);

  // 配置不存在则初始化
  let config = configRow;
  if (!config) {
    const now = Date.now();
    await db
      .prepare('INSERT INTO user_config (user_id, pay_day, snapshot_offsets, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, 10, '[0,7,14,21]', now, now)
      .run();
    config = await db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(userId).first<any>();
  }

  const userConfig = {
    user_id: config!.user_id,
    pay_day: config!.pay_day,
    snapshot_offsets: JSON.parse(config!.snapshot_offsets),
    created_at: config!.created_at,
    updated_at: config!.updated_at,
  };

  // 信用卡：解析 monthly_statements（DB 存的是 TEXT JSON，calc 需要对象）
  const cards = (cardRows.results || []).map((row: any) => {
    let monthly_statements: Record<string, number> = {};
    if (row?.monthly_statements) {
      try {
        const parsed = JSON.parse(row.monthly_statements);
        if (parsed && typeof parsed === 'object') monthly_statements = parsed;
      } catch { /* 损坏 JSON 当空表 */ }
    }
    return { ...row, monthly_statements };
  });

  const today = new Date();

  // 周期偏移：0=本期，-1=上一期，+1=下一期（以此类推）
  const cycleOffset = parseInt(c.req.query('cycle_offset') || '0');
  // 用 addMonths 偏移得到目标周期内的参考日期
  const refDate = cycleOffset === 0 ? today : addMonths(today, cycleOffset);
  const targetCycle = getCurrentCycle(refDate, userConfig.pay_day);
  const isPast = cycleOffset < 0;
  const isFuture = cycleOffset > 0;

  // V2 算法（用 refDate 确定目标周期）
  const calc = computeDashboardV2(
    refDate,
    userConfig,
    cashRows.results || [],
    cards,
    snapshotRows.results || [],
    investmentRows.results || [],
    billRows.results || [],
    incomeRows.results || [],
    subscriptionRows.results || [],
  );

  // 过去周期：用历史快照覆盖余额相关字段（快照记录了当时真实状态）
  let snapshotBased = false;
  if (isPast) {
    // 取该周期最新一条快照（offset_index 最大）
    const histSnap = await db
      .prepare(`SELECT * FROM snapshots WHERE user_id = ? AND cycle_id = ? ORDER BY offset_index DESC LIMIT 1`)
      .bind(userId, targetCycle.cycle_id)
      .first<any>();
    if (histSnap) {
      snapshotBased = true;
      // 用快照值覆盖计算值（快照存储了当时实测的余额/净可用/日均）
      calc.total_balance = histSnap.total_balance;
      calc.total_locked = histSnap.total_locked;
      calc.total_due = histSnap.total_due;
      calc.net_available = histSnap.net_available;
      calc.daily_budget = histSnap.daily_budget;
    }
  }

  return c.json({
    config: userConfig,
    cash_sources: cashRows.results || [],
    credit_cards: cards,
    investments: investmentRows.results || [],
    bills: billRows.results || [],
    incomes: incomeRows.results || [],
    subscriptions: subscriptionRows.results || [],
    calc,
    snapshots: snapshotRows.results || [],
    generated_at: Date.now(),
    // 周期切换元数据
    cycle_offset: cycleOffset,
    cycle_id: targetCycle.cycle_id,
    cycle_start: targetCycle.start_date_str,
    cycle_end: targetCycle.end_date_str,
    is_predicted: isFuture,
    snapshot_based: snapshotBased,
    has_history: isPast ? snapshotBased : true,
  });
});