/**
 * 财富模拟器 — 按月推演一生的资产轨迹
 *
 * 口径：
 *   - 全部按「今天的钱」（实际值）计算：收益率填的是扣除通胀后的实际收益，
 *     收入/支出/养老金都以今天的购买力表示；需要名义金额时由展示层 × (1+通胀)^年数。
 *   - 现金与投资分开：投资部分按「实际年化收益 − 费率」复利；
 *     现金按「(1+现金利率)/(1+通胀) − 1」计息（日本存款利率≈0 → 现金实际在缩水）。
 *   - 自住房不计入（由调用方决定 invested 里放什么）。
 *   - 财务自由目标 = 退休后年支出 ÷ 安全提取率（4% 法则 → × 25）。
 *
 * 每月顺序：期初判断是否达标/退休 → 资产计息 → 收入/支出/定投/大事件 → 现金不足时卖出投资（收益部分扣税）。
 */

export type SimEvent = {
  id: string;
  name: string;
  /** 发生年龄 */
  age: number;
  /** 总金额（今天的钱，正数） */
  amount: number;
  /** 分摊年数；0 = 一次性 */
  years: number;
  kind: 'expense' | 'income';
};

export type SimInput = {
  startAge: number;
  /** 模拟到此年龄 */
  lifeExpectancy: number;
  cash: number;
  /** 投资类资产（股票基金 / 加密 / 其他；默认不含自住房） */
  invested: number;
  /** 工作期间到手月收入 */
  monthlyIncome: number;
  /** 实际涨薪 %/年（扣除通胀后） */
  incomeGrowthPct: number;
  /** 工作期间月生活成本 */
  monthlyLivingCost: number;
  /** 工作期间每月定投 */
  monthlyInvest: number;
  /** 现金超过 N 个月生活费的部分每月自动转入投资；null = 不转 */
  cashBufferMonths: number | null;
  /** 财务自由（退休）后的月支出 */
  retireSpendMonthly: number;
  withdrawalRatePct: number;
  /** 投资实际年化收益 %（几何平均；随机模拟时为收益的中位数） */
  annualReturnPct: number;
  /** 年收益波动率 %（只用于随机模拟；全球股票约 15%） */
  volatilityPct: number;
  /** 年费率 % */
  feePct: number;
  /** 现金名义利率 % */
  cashRatePct: number;
  inflationPct: number;
  /** 卖出投资时对收益部分征税 %（NISA 内 0；特定口座约 20.315） */
  taxPct: number;
  /** 固定退休年龄；null = 达到目标即退休 */
  retireAge: number | null;
  /** 「达标即退」模式下最晚工作到几岁（之后不论是否达标都停止工资） */
  latestWorkAge: number;
  pensionStartAge: number;
  /** 养老金月额（今天的钱） */
  pensionMonthly: number;
  events: SimEvent[];
};

export type SimYearRow = {
  /** 第几年（0 = 今年） */
  year: number;
  /** 年初年龄（整数） */
  age: number;
  startTotal: number;
  income: number;       // 工资
  pension: number;
  spend: number;        // 生活支出
  eventsNet: number;    // 大事件净额（收入为正、支出为负）
  contribution: number; // 投入投资（定投 + 现金自动转入）
  returns: number;      // 投资收益 + 现金利息（实际值，现金为负说明被通胀侵蚀）
  withdrawal: number;   // 卖出投资
  tax: number;
  endCash: number;
  endInvested: number;
  endTotal: number;
  /** 本金（现金 + 投资成本） */
  principal: number;
  /** 累计收益（投资市值 − 投资成本） */
  gains: number;
  retired: boolean;
  /** 目标完成度 % */
  progressPct: number;
};

export type SimResult = {
  target: number;
  /** 达到目标的月份（从现在起第几个月）；未达成为 null */
  fireMonth: number | null;
  fireAge: number | null;
  retireMonth: number | null;
  retireAge: number | null;
  /** 资产耗尽（现金和投资都不够付支出）的年龄；撑到最后为 null */
  depletedAge: number | null;
  peak: number;
  peakAge: number;
  endAssets: number;
  months: number;
  rows: SimYearRow[];
};

const MAX_YEARS = 100;

/**
 * @param returns 可选：逐年的投资实际收益（小数，未扣费率），用于随机模拟；不给则每年都是 annualReturnPct
 */
export function simulate(input: SimInput, returns?: ArrayLike<number>): SimResult {
  const months = Math.max(12, Math.min(MAX_YEARS * 12, Math.ceil((input.lifeExpectancy - input.startAge) * 12)));
  const wr = input.withdrawalRatePct / 100;
  const target = wr > 0 && input.retireSpendMonthly > 0 ? Math.round((input.retireSpendMonthly * 12) / wr) : 0;
  const monthlyRate = (annual: number) => Math.pow(Math.max(0.0001, 1 + annual - input.feePct / 100), 1 / 12) - 1;
  let rInv = monthlyRate(input.annualReturnPct / 100);
  const rCash = Math.pow(Math.max(0.0001, (1 + input.cashRatePct / 100) / (1 + input.inflationPct / 100)), 1 / 12) - 1;
  const tax = Math.min(1, Math.max(0, input.taxPct / 100));
  const growth = 1 + input.incomeGrowthPct / 100;

  // 大事件 → [起始月, 月数, 每月金额(带符号)]
  const events = input.events
    .filter((e) => e.amount > 0)
    .map((e) => {
      const span = Math.max(1, Math.round(e.years * 12));
      const start = Math.round((e.age - input.startAge) * 12);
      const sign = e.kind === 'income' ? 1 : -1;
      return { start, end: start + span, monthly: (sign * e.amount) / span };
    });

  let cash = input.cash;
  let inv = Math.max(0, input.invested);
  let basis = inv;
  let retired = false;
  let fireMonth: number | null = null;
  let retireMonth: number | null = null;
  let depletedMonth: number | null = null;
  let peak = cash + inv;
  let peakMonth = 0;

  const rows: SimYearRow[] = [];
  let row: SimYearRow | null = null;

  for (let m = 0; m < months; m++) {
    const age = input.startAge + m / 12;
    const year = Math.floor(m / 12);
    const total = cash + inv;

    if (m % 12 === 0) {
      if (returns) rInv = monthlyRate(returns[year] ?? input.annualReturnPct / 100);
      row = {
        year, age: Math.floor(age), startTotal: total,
        income: 0, pension: 0, spend: 0, eventsNet: 0, contribution: 0, returns: 0, withdrawal: 0, tax: 0,
        endCash: 0, endInvested: 0, endTotal: 0, principal: 0, gains: 0, retired: false, progressPct: 0,
      };
      rows.push(row);
    }
    const r = row!;

    // 期初：是否达标 / 是否退休
    if (fireMonth === null && target > 0 && total >= target) fireMonth = m;
    if (!retired) {
      const shouldRetire = input.retireAge !== null
        ? age >= input.retireAge
        : fireMonth !== null || age >= input.latestWorkAge;
      if (shouldRetire) { retired = true; retireMonth = m; }
    }

    // 计息（负现金 = 透支，不计息）
    const gInv = inv * rInv;
    const gCash = cash > 0 ? cash * rCash : 0;
    inv += gInv;
    cash += gCash;
    r.returns += gInv + gCash;

    // 收支
    const income = retired ? 0 : input.monthlyIncome * Math.pow(growth, year);
    const pension = age >= input.pensionStartAge ? input.pensionMonthly : 0;
    const spend = retired ? input.retireSpendMonthly : input.monthlyLivingCost;
    let ev = 0;
    for (const e of events) if (m >= e.start && m < e.end) ev += e.monthly;
    const contrib = retired ? 0 : Math.max(0, input.monthlyInvest);

    cash += income + pension + ev - spend - contrib;
    inv += contrib;
    basis += contrib;
    r.income += income;
    r.pension += pension;
    r.spend += spend;
    r.eventsNet += ev;
    r.contribution += contrib;

    // 现金缓冲：多出来的现金转入投资
    if (!retired && input.cashBufferMonths !== null) {
      const buf = input.cashBufferMonths * input.monthlyLivingCost;
      if (cash > buf) {
        const x = cash - buf;
        cash -= x; inv += x; basis += x;
        r.contribution += x;
      }
    }

    // 现金不够 → 卖投资补足；卖出部分里的收益要交税
    if (cash < 0 && inv > 0) {
      const gainShare = inv > basis ? 1 - basis / inv : 0;
      const gross = -cash / (1 - tax * gainShare);
      const sell = Math.min(gross, inv);
      const t = sell * gainShare * tax;
      basis -= basis * (sell / inv);
      inv -= sell;
      cash += sell - t;
      r.withdrawal += sell;
      r.tax += t;
    }
    if (cash < -1 && inv <= 0 && depletedMonth === null) depletedMonth = m;

    const end = cash + inv;
    if (end > peak) { peak = end; peakMonth = m + 1; }

    r.endCash = cash;
    r.endInvested = inv;
    r.endTotal = end;
    r.principal = Math.max(0, cash) + basis;
    r.gains = inv - basis;
    r.retired = retired;
    r.progressPct = target > 0 ? Math.max(0, (end / target) * 100) : 0;
  }

  const ageAt = (m: number | null) => (m === null ? null : Math.round((input.startAge + m / 12) * 10) / 10);
  const last = rows[rows.length - 1];
  return {
    target,
    fireMonth,
    fireAge: ageAt(fireMonth),
    retireMonth,
    retireAge: ageAt(retireMonth),
    depletedAge: ageAt(depletedMonth),
    peak,
    peakAge: ageAt(peakMonth)!,
    endAssets: last ? last.endTotal : cash + inv,
    months,
    rows,
  };
}

// ── 情景 ───────────────────────────────────────────────────────

export const SCENARIO_SHIFT_PCT = 2;

/** 悲观 / 基准 / 乐观：收益率 −2 / ±0 / +2 个百分点 */
export function simulateScenarios(input: SimInput) {
  return {
    pessimistic: simulate({ ...input, annualReturnPct: input.annualReturnPct - SCENARIO_SHIFT_PCT }),
    base: simulate(input),
    optimistic: simulate({ ...input, annualReturnPct: input.annualReturnPct + SCENARIO_SHIFT_PCT }),
  };
}

// ── 反推目标 ───────────────────────────────────────────────────

/** 「达标即退」口径下：在 targetAge 前（含）达到财务自由目标？ */
function reachesBy(input: SimInput, targetAge: number): boolean {
  const r = simulate({
    ...input,
    retireAge: null,
    latestWorkAge: Math.max(input.latestWorkAge, targetAge + 1),
    lifeExpectancy: Math.max(targetAge + 1, input.startAge + 1),
  });
  return r.fireAge !== null && r.fireAge <= targetAge;
}

/**
 * 想在 targetAge 实现财务自由，每月至少要定投多少（以 1000 円为单位）。
 * 已经能达成 → 0；投多少都达不到（定投超过结余后只是在搬运现金）→ null。
 */
export function solveMonthlyInvest(input: SimInput, targetAge: number): number | null {
  if (targetAge <= input.startAge) return null;
  if (reachesBy({ ...input, monthlyInvest: 0, cashBufferMonths: null }, targetAge)) return 0;
  let hi = Math.max(100_000, input.monthlyIncome * 2);
  if (!reachesBy({ ...input, monthlyInvest: hi, cashBufferMonths: null }, targetAge)) return null;
  let lo = 0;
  for (let i = 0; i < 40 && hi - lo > 1000; i++) {
    const mid = (lo + hi) / 2;
    if (reachesBy({ ...input, monthlyInvest: mid, cashBufferMonths: null }, targetAge)) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi / 1000) * 1000;
}

/**
 * 想在 targetAge 实现财务自由，退休后每月最多能花多少（以 1000 円为单位）。
 * 支出越低目标越低；连 0 都达不到 → null（不会发生，除非 targetAge ≤ 现在）。
 */
export function solveRetireSpend(input: SimInput, targetAge: number): number | null {
  if (targetAge <= input.startAge) return null;
  const ok = (spend: number) => reachesBy({ ...input, retireSpendMonthly: spend }, targetAge);
  if (!ok(1000)) return null;
  let lo = 1000;
  let hi = Math.max(1_000_000, input.retireSpendMonthly * 4);
  if (ok(hi)) return Math.floor(hi / 1000) * 1000;
  for (let i = 0; i < 40 && hi - lo > 1000; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 1000) * 1000;
}

// ── 杠杆：哪个改动最能提前财务自由 ─────────────────────────────

export type SimLever = {
  key: 'invest' | 'spend' | 'return';
  label: string;
  /** 提前的月数（正 = 提前）；从「达不到」变成「能达到」时为 Infinity */
  monthsEarlier: number;
};

export function leverStep(input: SimInput): number {
  // 每月多投：月收入的 10%，取整到万，至少 1 万
  return Math.max(10_000, Math.round((input.monthlyIncome * 0.1) / 10_000) * 10_000);
}

export function computeLevers(input: SimInput): SimLever[] {
  const fm = (i: SimInput) => simulate({ ...i, retireAge: null }).fireMonth;
  const base = fm(input);
  const step = leverStep(input);
  const diff = (alt: number | null): number => {
    if (alt === null) return base === null ? 0 : -Infinity;
    if (base === null) return Infinity;
    return base - alt;
  };
  return ([
    { key: 'invest', label: `每月多投 ¥${(step / 10_000).toLocaleString()}万`, monthsEarlier: diff(fm({ ...input, monthlyInvest: input.monthlyInvest + step })) },
    { key: 'spend', label: '退休后月支出减 10%', monthsEarlier: diff(fm({ ...input, retireSpendMonthly: input.retireSpendMonthly * 0.9 })) },
    { key: 'return', label: '年化收益 +1%', monthsEarlier: diff(fm({ ...input, annualReturnPct: input.annualReturnPct + 1 })) },
  ] as SimLever[]).sort((a, b) => b.monthsEarlier - a.monthsEarlier);
}

// ── 参数：基准（来自真实数据）+ 用户覆盖 ─────────────────────

/** 模拟器里用户改过的参数（存 user_config.simulator_settings）；缺省字段 = 跟随真实数据 */
export type SimulatorSettings = Partial<Omit<SimInput, 'startAge' | 'cash' | 'invested' | 'events'>> & {
  includeRealEstate?: boolean;
  events?: SimEvent[];
};

export const SIM_DEFAULTS = {
  lifeExpectancy: 90,
  incomeGrowthPct: 0,
  cashBufferMonths: null as number | null,
  feePct: 0,
  cashRatePct: 0,
  inflationPct: 2,
  taxPct: 0,
  retireAge: null as number | null,
  latestWorkAge: 65,
  pensionStartAge: 65,
  pensionMonthly: 0,
  volatilityPct: 15,
};

/** 用户覆盖合并到基准上（只取 SimInput 的字段） */
export function applySimSettings(base: SimInput, s: SimulatorSettings | null | undefined): SimInput {
  if (!s) return base;
  const out: SimInput = { ...base };
  (Object.keys(base) as (keyof SimInput)[]).forEach((k) => {
    const v = (s as Record<string, unknown>)[k];
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  });
  return out;
}

// ── 随机模拟（蒙特卡洛）────────────────────────────────────────
//
// 每年的投资收益从对数正态分布里抽：ln(1+r) ~ N(ln(1+μ), σ_log)，
// μ = 预期年化收益（几何），σ_log 由波动率换算。这样「中位数路线」≈ 固定收益的那条线。
// 用固定种子 + 同一组随机数（common random numbers）：参数一变，所有路线一起平移，
// 拖动滑块时成功率不会因为随机数不同而跳来跳去。

export type MonteCarloBand = {
  t: number;        // 距今年数
  age: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /** 到这个时间点还没耗尽资产的路线占比（0~1） */
  alive: number;
};

export type MonteCarloResult = {
  runs: number;
  /** 一直撑到模拟结束都没耗尽的比例（0~1） */
  successRate: number;
  /** 能达到财务自由目标的比例 */
  fireRate: number;
  /** 达成年龄的分位数（达不到的路线算作 ∞；对应分位落在 ∞ 时为 null） */
  fireAgeP10: number | null;
  fireAgeP50: number | null;
  fireAgeP90: number | null;
  endP10: number;
  endP50: number;
  endP90: number;
  bands: MonteCarloBand[];
};

/** mulberry32：小而快的可复现伪随机数 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shockCache = new Map<string, Float64Array>();

/** runs × years 个标准正态随机数（Box-Muller），按 (runs, years, seed) 缓存 */
function shocks(runs: number, years: number, seed: number): Float64Array {
  const key = `${runs}x${years}x${seed}`;
  const hit = shockCache.get(key);
  if (hit) return hit;
  const rnd = mulberry32(seed);
  const out = new Float64Array(runs * years);
  for (let i = 0; i < out.length; i += 2) {
    const u1 = Math.max(1e-12, rnd());
    const u2 = rnd();
    const r = Math.sqrt(-2 * Math.log(u1));
    out[i] = r * Math.cos(2 * Math.PI * u2);
    if (i + 1 < out.length) out[i + 1] = r * Math.sin(2 * Math.PI * u2);
  }
  if (shockCache.size > 8) shockCache.clear();
  shockCache.set(key, out);
  return out;
}

/** 第 run 条路线的逐年收益（小数） */
function pathReturns(input: SimInput, z: Float64Array, run: number, years: number): Float64Array {
  const mu = Math.log(Math.max(0.0001, 1 + input.annualReturnPct / 100));
  const vol = Math.max(0, input.volatilityPct) / 100;
  const sigma = Math.sqrt(Math.log(1 + (vol * vol) / Math.pow(1 + input.annualReturnPct / 100, 2)));
  const out = new Float64Array(years);
  for (let y = 0; y < years; y++) out[y] = Math.exp(mu + sigma * z[run * years + y]!) - 1;
  return out;
}

function simYears(input: SimInput): number {
  return Math.max(1, Math.min(MAX_YEARS, Math.ceil(input.lifeExpectancy - input.startAge)));
}

function quantile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i]!;
}

export const MC_RUNS = 1000;
export const MC_SEED = 20261020;

export function monteCarlo(input: SimInput, opts: { runs?: number; seed?: number } = {}): MonteCarloResult {
  const runs = opts.runs ?? MC_RUNS;
  const years = simYears(input);
  const z = shocks(runs, years, opts.seed ?? MC_SEED);

  const totals: Float64Array[] = []; // [year][run]，year 0 = 现在
  for (let y = 0; y <= years; y++) totals.push(new Float64Array(runs));
  const depletedYear = new Float64Array(runs).fill(Infinity);
  const fireAges = new Float64Array(runs);
  let success = 0;
  let fire = 0;

  for (let i = 0; i < runs; i++) {
    const r = simulate(input, pathReturns(input, z, i, years));
    totals[0]![i] = input.cash + input.invested;
    for (let y = 0; y < years; y++) totals[y + 1]![i] = r.rows[y] ? r.rows[y]!.endTotal : r.endAssets;
    if (r.depletedAge === null) success++;
    else depletedYear[i] = r.depletedAge - input.startAge;
    if (r.fireAge !== null) fire++;
    fireAges[i] = r.fireAge ?? Infinity;
  }

  const bands: MonteCarloBand[] = [];
  for (let y = 0; y <= years; y++) {
    const col = totals[y]!.slice().sort();
    let alive = 0;
    for (let i = 0; i < runs; i++) if (depletedYear[i]! > y) alive++;
    const t = Math.min(y, input.lifeExpectancy - input.startAge);
    bands.push({
      t, age: input.startAge + t,
      p10: quantile(col, 0.1), p25: quantile(col, 0.25), p50: quantile(col, 0.5),
      p75: quantile(col, 0.75), p90: quantile(col, 0.9),
      alive: alive / runs,
    });
  }
  const sortedFire = fireAges.slice().sort();
  const fq = (q: number) => { const v = quantile(sortedFire, q); return Number.isFinite(v) ? v : null; };
  const end = totals[years]!.slice().sort();
  return {
    runs,
    successRate: success / runs,
    fireRate: fire / runs,
    fireAgeP10: fq(0.1),
    fireAgeP50: fq(0.5),
    fireAgeP90: fq(0.9),
    endP10: quantile(end, 0.1),
    endP50: quantile(end, 0.5),
    endP90: quantile(end, 0.9),
    bands,
  };
}

// ── 成功率热力图：退休年龄 × 退休后月支出 ──────────────────────

export type SuccessGrid = {
  ages: number[];
  spends: number[];
  /** rates[支出行][年龄列]，0~1 */
  rates: number[][];
};

/** 默认的网格轴：年龄每 5 岁一列（最多 8 列），支出为当前值的 70%~130% */
export function successGridAxes(input: SimInput): { ages: number[]; spends: number[] } {
  const first = Math.max(Math.ceil(input.startAge) + 1, Math.ceil((input.startAge + 3) / 5) * 5);
  const last = Math.min(75, input.lifeExpectancy - 5);
  const ages: number[] = [];
  for (let a = first; a <= last && ages.length < 8; a += 5) ages.push(a);
  const base = Math.max(10_000, input.retireSpendMonthly);
  // 中间一行用当前值本身（不取整），这样框出的「当前方案」格子和成功率 KPI 完全一致
  const spends = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3].map((k) => (k === 1 ? Math.round(base) : Math.round((base * k) / 10_000) * 10_000));
  return { ages, spends: [...new Set(spends)] };
}

/**
 * 在 age 岁固定退休、退休后每月花 spend 时，钱撑到模拟结束的概率。
 * 默认和主模拟同样的 1000 条路线（同一组随机数），格子与成功率 KPI 口径一致。
 */
export function successGrid(
  input: SimInput,
  axes: { ages: number[]; spends: number[] },
  opts: { runs?: number; seed?: number } = {},
): SuccessGrid {
  const runs = opts.runs ?? MC_RUNS;
  const rates = axes.spends.map((spend) =>
    axes.ages.map((age) => monteCarlo({ ...input, retireAge: age, retireSpendMonthly: spend }, { runs, seed: opts.seed }).successRate),
  );
  return { ...axes, rates };
}
