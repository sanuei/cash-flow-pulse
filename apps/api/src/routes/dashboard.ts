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
import { computeDashboardV2, computeDailyCashflow, addMonths, getCurrentCycle, diffDays } from '@cfp/shared';
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
    oneOffRows,
  ] = await Promise.all([
    db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(userId).first<any>(),
    db.prepare('SELECT * FROM cash_sources WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
    db.prepare('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
    db.prepare('SELECT * FROM snapshots WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT 100').bind(userId).all<any>(),
    db.prepare('SELECT * FROM recurring_investments WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
    db.prepare('SELECT * FROM recurring_bills WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
    db.prepare('SELECT * FROM recurring_incomes WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
    db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').bind(userId).all<any>(),
    db.prepare('SELECT * FROM one_off_expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC').bind(userId).all<any>(),
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
    weekend_shift: !!config!.weekend_shift,
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
    oneOffRows.results || [],
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

  // 未来周期：纯现金流预测（不知道未来的真实现金余额，所以不沿用今天的账户余额）
  //   净可用现金 → 该期预计结余 = 该期预计收入 − 该期固定支出（卡+账单+订阅+投资）
  //   日均预算   → 结余 ÷ 完整周期天数（整期都在未来，不能只除剩余的几天）
  //   （原实现用 addMonths(today) 当作"今天"，导致净可用沿用今天现金、天数退化成 ~6 天，
  //     算出来跟本期一模一样，看着像没切换）
  if (isFuture) {
    const cycleDays = Math.max(1, diffDays(targetCycle.start_date, targetCycle.end_date));
    const projectedNet = calc.total_income - calc.total_expense;
    calc.net_available = projectedNet;
    calc.days_to_payday = cycleDays;
    calc.daily_budget = Math.max(0, Math.floor(projectedNet / cycleDays));
    calc.current_cycle_day = 0; // 该期尚未开始
  }

  return c.json({
    config: userConfig,
    cash_sources: cashRows.results || [],
    credit_cards: cards,
    investments: investmentRows.results || [],
    bills: billRows.results || [],
    incomes: incomeRows.results || [],
    subscriptions: subscriptionRows.results || [],
    one_offs: oneOffRows.results || [],
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

// ── 本期逐日现金流（按每笔扣款/到账实际发生日推演）──
dashboardRoute.get('/cashflow', async (c) => {
  const userId = c.get('user')!.id;
  const db = c.env.DB;

  const [configRow, cashRows, cardRows, investmentRows, billRows, incomeRows, subscriptionRows, oneOffRows] =
    await Promise.all([
      db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(userId).first<any>(),
      db.prepare('SELECT * FROM cash_sources WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM credit_cards WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM recurring_investments WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM recurring_bills WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM recurring_incomes WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM one_off_expenses WHERE user_id = ?').bind(userId).all<any>(),
    ]);

  if (!configRow) return c.json({ error: '尚无配置数据' }, 400);

  const userConfig = {
    user_id: configRow.user_id,
    pay_day: configRow.pay_day,
    snapshot_offsets: JSON.parse(configRow.snapshot_offsets),
    weekend_shift: !!configRow.weekend_shift,
    created_at: configRow.created_at,
    updated_at: configRow.updated_at,
  };

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

  // 向未来延伸的周期数（0=只本期，最多 3）
  const periods = Math.max(0, Math.min(3, parseInt(c.req.query('periods') || '0', 10) || 0));

  const result = computeDailyCashflow(
    new Date(),
    userConfig,
    cashRows.results || [],
    cards,
    investmentRows.results || [],
    billRows.results || [],
    incomeRows.results || [],
    subscriptionRows.results || [],
    periods,
    oneOffRows.results || [],
  );

  return c.json(result);
});