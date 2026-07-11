/**
 * AI 财务诊断（/api/ai）
 *
 * POST /api/ai/diagnose
 *   1. 复用 computeDashboardV2 计算本期指标 + 读历史快照
 *   2. 组装「脱敏财务摘要」——只有聚合数字/比例/趋势，
 *      绝不包含账户名、银行/机构名、信用卡名等任何名称类字段
 *   3. 调用智谱 GLM（key 存 Worker secret GLM_API_KEY，前端永不接触）
 *   4. 返回 Markdown 分析
 *
 * 安全约束：
 *   - API key 只在 Worker secret，不写代码、不下发前端
 *   - 发给第三方(智谱)的仅聚合摘要，无原始资产清单
 *   - 每用户每天限 DAILY_LIMIT 次，防 key 被刷爆
 */

import { Hono } from 'hono';
import { computeDashboardV2, formatDate } from '@cfp/shared';
import { generateId } from '../lib/utils';
import { FOUNDER_EMAIL } from '../lib/auth';
import type { Env } from '../index';

export const aiRoutes = new Hono<{ Bindings: Env }>();

const DAILY_LIMIT = 5;
const GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const DEFAULT_MODEL = 'glm-5.2'; // 智谱旗舰；可用 GLM_MODEL var/secret 覆盖

// 摘要里所有金额四舍五入到整数，比例保留整数百分比
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const yen = (n: number) => Math.round(n);

aiRoutes.post('/diagnose', async (c) => {
  const user = c.get('user')!;
  const userId = user.id;
  const db = c.env.DB;
  // 创始人账号不限次
  const isUnlimited = (user.email ?? '').toLowerCase() === FOUNDER_EMAIL.toLowerCase();

  if (!c.env.GLM_API_KEY) {
    return c.json({ error: 'AI 服务未配置（缺少 GLM_API_KEY）' }, 503);
  }

  // ── 每日限次（豁免账号跳过）──
  const todayStr = formatDate(new Date());
  const usageRow = await db
    .prepare('SELECT count FROM ai_usage WHERE user_id = ? AND date = ?')
    .bind(userId, todayStr)
    .first<{ count: number }>();
  const used = usageRow?.count ?? 0;
  if (!isUnlimited && used >= DAILY_LIMIT) {
    return c.json(
      { error: `今日 AI 诊断次数已用完（每天 ${DAILY_LIMIT} 次）`, limit_reached: true },
      429,
    );
  }

  // ── 拉数据（与 dashboard 一致）──
  const [configRow, cashRows, cardRows, snapshotRows, investmentRows, billRows, incomeRows, subscriptionRows, oneOffRows, otherAssetRows] =
    await Promise.all([
      db.prepare('SELECT * FROM user_config WHERE user_id = ?').bind(userId).first<any>(),
      db.prepare('SELECT * FROM cash_sources WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM credit_cards WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM snapshots WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT 100').bind(userId).all<any>(),
      db.prepare('SELECT * FROM recurring_investments WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM recurring_bills WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM recurring_incomes WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM one_off_expenses WHERE user_id = ?').bind(userId).all<any>(),
      db.prepare('SELECT * FROM other_assets WHERE user_id = ?').bind(userId).all<any>(),
    ]);

  if (!configRow) {
    return c.json({ error: '尚无配置数据，先在应用里录入收支后再诊断' }, 400);
  }

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

  const calc = computeDashboardV2(
    new Date(),
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

  // ── 组装脱敏摘要（仅聚合数字，无任何名称）──
  const summary = buildSummary(calc, snapshotRows.results || [], otherAssetRows.results || []);

  // ── 调 GLM ──
  let analysis: string;
  try {
    analysis = await callGLM(c.env, summary);
  } catch (e: any) {
    console.error('[ai] GLM 调用失败:', e?.message || e);
    return c.json({ error: 'AI 分析暂时不可用，请稍后重试' }, 502);
  }

  // ── 记一次用量（成功才计数）──
  await db
    .prepare(
      'INSERT INTO ai_usage (user_id, date, count) VALUES (?, ?, 1) ' +
        'ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1',
    )
    .bind(userId, todayStr)
    .run();

  // ── 持久化诊断记录（保留历史，可回看/对比）──
  const diagId = generateId();
  const score = parseScore(analysis);
  const metrics = buildMetrics(calc);
  const model = c.env.GLM_MODEL || DEFAULT_MODEL;
  const now = Date.now();
  await db
    .prepare(
      'INSERT INTO ai_diagnoses (id, user_id, cycle_id, model, score, analysis, metrics_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(diagId, userId, calc.cycle_id, model, score, analysis, JSON.stringify(metrics), now)
    .run();

  return c.json({
    id: diagId,
    cycle_id: calc.cycle_id,
    score,
    analysis,
    metrics,
    generated_at: now,
    remaining: isUnlimited ? null : DAILY_LIMIT - used - 1,
  });
});

// ── 历史记录：最近 20 条 ──
aiRoutes.get('/history', async (c) => {
  const userId = c.get('user')!.id;
  const rows = await c.env.DB
    .prepare(
      'SELECT id, cycle_id, model, score, analysis, metrics_json, created_at FROM ai_diagnoses WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    )
    .bind(userId)
    .all<any>();
  const items = (rows.results || []).map((r: any) => {
    let metrics: Metric[] = [];
    if (r.metrics_json) {
      try { metrics = JSON.parse(r.metrics_json); } catch { /* 旧记录无 metrics */ }
    }
    const { metrics_json: _m, ...rest } = r;
    return { ...rest, metrics };
  });
  return c.json({ items });
});

// 从 Markdown 里解析「评分：NN/100」→ 0-100 整数（无则 null）
function parseScore(md: string): number | null {
  const m = md.match(/评分[:：]\s*(\d{1,3})/);
  if (!m || !m[1]) return null;
  const n = parseInt(m[1], 10);
  return n >= 0 && n <= 100 ? n : null;
}

// 类别汇总（只出总额，不带任何资产名称）
const ASSET_CATEGORY_LABEL: Record<string, string> = {
  stock: '股票基金',
  crypto: '加密货币',
  real_estate: '房产',
  other: '其他',
};

// ── 脱敏摘要：把 calc 提炼成聚合指标 ─────────────────────────────────
function buildSummary(calc: ReturnType<typeof computeDashboardV2>, snapshots: any[], otherAssets: any[] = []) {
  const ue = calc.upcoming_expenses;
  const totalExpense = calc.total_expense || 0;
  const consume = (ue?.total_credit_card ?? 0) + (ue?.total_bills ?? 0) + (ue?.total_subscriptions ?? 0);
  const invest = ue?.total_investments ?? 0;

  // 历史趋势：按周期取每期最新一条快照的净可用/结余，最近 6 期
  const byCycle = new Map<string, any>();
  for (const s of snapshots) {
    const prev = byCycle.get(s.cycle_id);
    if (!prev || s.snapshot_date > prev.snapshot_date) byCycle.set(s.cycle_id, s);
  }
  const trend = [...byCycle.values()]
    .sort((a, b) => (a.cycle_id < b.cycle_id ? -1 : 1))
    .slice(-6)
    .map((s) => ({
      周期: s.cycle_id,
      净可用现金: yen(s.net_available),
      日均预算: yen(s.daily_budget),
      当期收入: yen(s.total_income ?? 0),
      当期支出: yen(s.total_expense ?? 0),
    }));

  // 应急金覆盖月数 = 净可用现金 ÷ 月支出（本期支出≈一个月）；理论基准 3-6 月
  // 注意：分母/分子均只用净可用现金（流动资产），不含下方「其他资产」——
  // 股票/加密货币/房产波动大、不能说取就取，不该虚增抗风险能力
  const emergencyMonths = totalExpense > 0
    ? Math.round((calc.net_available / totalExpense) * 10) / 10
    : null;

  // 其他资产：按类别汇总市值（无任何具体资产名称），供 AI 做净值/多元化层面的参考
  const otherAssetsByCategory: Record<string, number> = {};
  for (const a of otherAssets) {
    const label = ASSET_CATEGORY_LABEL[a.category] ?? '其他';
    otherAssetsByCategory[label] = (otherAssetsByCategory[label] ?? 0) + yen(a.value ?? 0);
  }
  const otherAssetsTotal = Object.values(otherAssetsByCategory).reduce((s, v) => s + v, 0);

  return {
    本期周期: calc.cycle_id,
    周期已过天数: calc.current_cycle_day,
    距发薪日天数: calc.days_to_payday,
    现金账户: {
      总余额: yen(calc.total_balance),
      锁定金额: yen(calc.total_locked),
      净可用现金: yen(calc.net_available),
    },
    // 股票/基金、加密货币、房产等，仅类别汇总市值（不参与预算/应急金计算，供净值与配置层面参考）
    其他资产: otherAssetsTotal > 0 ? { 按类别汇总: otherAssetsByCategory, 合计: otherAssetsTotal } : null,
    总净值_现金加其他资产: yen(calc.net_available) + otherAssetsTotal,
    日均可用预算: yen(calc.daily_budget),
    本期收入总额: yen(calc.total_income),
    本期支出: {
      总额: yen(totalExpense),
      信用卡: yen(ue?.total_credit_card ?? 0),
      固定账单: yen(ue?.total_bills ?? 0),
      订阅: yen(ue?.total_subscriptions ?? 0),
      固定投资: yen(invest),
    },
    结构占比: {
      消费占支出_pct: pct(consume, totalExpense),
      投资占支出_pct: pct(invest, totalExpense),
    },
    本期结余: yen(calc.total_income - totalExpense),
    储蓄率_pct: pct(calc.total_income - totalExpense, calc.total_income),
    投资率_pct: pct(invest, calc.total_income),
    抗风险: {
      应急金覆盖月数: emergencyMonths,   // 净可用现金 ÷ 月支出；基准 3-6 月
      消费占收入_pct: pct(consume, calc.total_income),
    },
    近期走势: trend,
    货币单位: '日元(JPY)',
  };
}

// ── 结构化健康指标（确定性，不依赖 AI；用于前端图表 + 历史存档）──
type Metric = {
  key: string;
  label: string;
  valueText: string;                       // 展示值，如 "13%" / "1.2 个月" / "+¥41,305"
  status: 'good' | 'warning' | 'bad';      // 后端按达标线判定
  bar?: { pct: number; markPct?: number }; // pct=填充%(0-100)，markPct=达标线位置%
  criteria: string;                        // 完整分档标准（优秀/一般/不足的线）
  verdict: string;                         // 该项结论
  advice: string;                          // 具体目标数字（确定性算缺口）
};

function buildMetrics(calc: ReturnType<typeof computeDashboardV2>): Metric[] {
  const ue = calc.upcoming_expenses;
  const income = calc.total_income || 0;
  const totalExpense = calc.total_expense || 0;
  const consume = (ue?.total_credit_card ?? 0) + (ue?.total_bills ?? 0) + (ue?.total_subscriptions ?? 0);
  const invest = ue?.total_investments ?? 0;
  const surplus = income - totalExpense;

  const rate = (part: number) => (income > 0 ? Math.round((part / income) * 100) : 0);
  const savings = rate(surplus);
  const consumeRatio = rate(consume);
  const investRate = rate(invest);
  const emg = totalExpense > 0 ? Math.round((calc.net_available / totalExpense) * 10) / 10 : 0;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(100, Math.round((v / max) * 100)));
  const yen0 = (n: number) => '¥' + Math.round(Math.abs(n)).toLocaleString('en-US');
  const signed = (n: number) => (n >= 0 ? '+' : '−') + yen0(n);

  // 各项达标目标（确定性算缺口，给出具体行动数字）
  const targetSurplus = Math.round(income * 0.2); // 储蓄率 20%
  const savingsGap = targetSurplus - surplus;
  const targetNet = Math.round(totalExpense * 3); // 应急金 3 个月
  const emgGap = targetNet - calc.net_available;
  const targetConsume = Math.round(income * 0.5); // 消费 ≤50%
  const consumeCut = consume - targetConsume;

  return [
    {
      key: 'savings', label: '储蓄率', valueText: `${savings}%`,
      status: savings >= 20 ? 'good' : savings >= 10 ? 'warning' : 'bad',
      bar: { pct: clamp(savings, 40), markPct: clamp(20, 40) },
      criteria: '≥20% 优秀 · 10–20% 一般 · <10% 偏低',
      verdict: savings >= 20 ? '优秀' : savings >= 10 ? '一般' : '偏低',
      advice: income <= 0 ? '暂无收入数据'
        : savingsGap <= 0 ? '已达 20% 目标，继续保持'
        : `距 20% 目标（结余 ${yen0(targetSurplus)}）还差 ${yen0(savingsGap)}/期`,
    },
    {
      key: 'emergency', label: '应急金', valueText: emg > 0 ? `${emg} 个月` : '—',
      status: emg >= 3 ? 'good' : emg >= 1.5 ? 'warning' : 'bad',
      bar: { pct: clamp(emg, 6), markPct: clamp(3, 6) },
      criteria: '≥3 个月 达标 · 1.5–3 偏低 · <1.5 不足',
      verdict: emg >= 3 ? '达标' : emg >= 1.5 ? '偏低' : '不足',
      advice: totalExpense <= 0 ? '暂无支出数据'
        : emgGap <= 0 ? '应急金充足，继续保持'
        : `补到 3 个月（${yen0(targetNet)}）还差 ${yen0(emgGap)}`,
    },
    {
      key: 'consume', label: '消费占收入', valueText: `${consumeRatio}%`,
      status: consumeRatio <= 50 ? 'good' : consumeRatio <= 70 ? 'warning' : 'bad',
      bar: { pct: clamp(consumeRatio, 100), markPct: clamp(50, 100) },
      criteria: '≤50% 健康 · 50–70% 偏紧 · >70% 过高',
      verdict: consumeRatio <= 50 ? '健康' : consumeRatio <= 70 ? '偏紧' : '过高',
      advice: income <= 0 ? '暂无收入数据'
        : consumeCut <= 0 ? '消费占比健康'
        : `降到收入 50%（≤${yen0(targetConsume)}）需再压 ${yen0(consumeCut)}`,
    },
    {
      key: 'invest', label: '投资率', valueText: `${investRate}%`,
      status: investRate > 0 ? 'good' : 'warning',
      bar: { pct: clamp(investRate, 30) },
      criteria: '有持续投资为佳（不应牺牲应急金）',
      verdict: investRate > 0 ? '良好' : '暂无',
      advice: investRate > 0
        ? (emg >= 3 ? '有持续投资，可视目标适度提高' : '应急金补足后再提高投资')
        : '暂无投资，先补应急金再考虑',
    },
    {
      key: 'cashflow', label: '本期结余', valueText: signed(surplus),
      status: surplus > 0 ? 'good' : surplus === 0 ? 'warning' : 'bad',
      criteria: '≥0 正向 · <0 透支',
      verdict: surplus > 0 ? '正向' : surplus === 0 ? '持平' : '透支',
      advice: surplus > 0 ? '本期正向，继续保持'
        : surplus === 0 ? '收支持平，尽量留出结余'
        : `本期透支 ${yen0(surplus)}，需削减支出或增收`,
    },
  ];
}

// ── 调用智谱 GLM ────────────────────────────────────────────────
async function callGLM(env: Env, summary: unknown): Promise<string> {
  const model = env.GLM_MODEL || DEFAULT_MODEL;

  const systemPrompt = [
    '你是一位专业、务实的个人理财顾问。用户会给你一份【已脱敏的聚合财务摘要】(仅数字，无任何账户/机构名称)。',
    '你必须依据下面这套【客观评分标准】逐项对照打分，而不是凭感觉给分。标准综合了 50/30/20 预算法则、通用应急金共识与 CFPB 金融健康量表(0-100)：',
    [
      '评分维度与达标线(总分 0-100，各维度对照后综合)：',
      '1) 现金流健康（权重高）：本期结余 ≥ 0 为及格；储蓄率 ≥20% 优秀 / 10-20% 一般 / <10% 偏弱（50/30/20 建议储蓄+还债≥20%）。',
      '2) 抗风险·应急金（权重高）：应急金覆盖月数 ≥6 充足 / 3-6 合格 / <3 不足（通用共识 3-6 个月必要开支）。',
      '3) 支出结构：消费占收入 ≤50% 健康，越高越吃紧。',
      '4) 财富增值：有持续投资(投资率>0)加分，但不应以牺牲应急金为代价。',
      '5) 趋势：近期净可用现金稳定或上升为佳，持续下滑扣分。',
    ].join('\n'),
    '若摘要中含【其他资产】(股票基金/加密货币/房产等按类别汇总的市值)，这是补充参考信息：'
      + '可用于评论整体净值规模、资产配置是否过度集中于单一类别(如全部加密货币)。'
      + '但这些资产波动大、不能说取就取，【不算入】应急金覆盖月数或现金流健康评分——那两项只看净可用现金。'
      + '若该字段为 null 表示用户未记录其他资产，不要因此评价"资产单一"。',
    '注意：每个维度的实际数值、标准、结论、目标缺口已由系统在图表中逐项展示，你【不要】再逐项复述数字，聚焦总体解读、跨维度的风险与综合建议。',
    '请用中文、Markdown 输出，结构如下：',
    '## 总体健康度\n首行必须是「评分：NN/100」(整数)，随后一到两句话结论（点明最拖后腿的 1-2 项）。',
    '## 风险与关注点\n2-3 条最需要改进的问题（可跨维度关联，如"应急金不足却仍在投资"）。',
    '## 行动建议\n3-4 条具体、可落地的建议，按优先级排序。',
    '要求：只依据给定数字，不要编造未提供的信息；金额都是日元；评分必须与各维度状态一致(不能多数不达标却给高分)；语气专业但亲切；总字数控制在 350 字以内。',
  ].join('\n\n');

  const res = await fetch(GLM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GLM_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '这是我的财务摘要，请诊断:\n\n' + JSON.stringify(summary, null, 2) },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GLM ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('GLM 返回内容为空');
  }
  return content.trim();
}
