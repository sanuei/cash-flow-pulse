import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Card } from '../components/Card';
import { Money } from '../components/Money';
import { LoadingState } from '../components/States';
import { Icon } from '../components/Icon';
import { formatYen } from '@cfp/shared';
import { apiGet } from '../lib/api';
import type {
  UpcomingExpenseItem,
  UpcomingIncomeItem,
  InvestmentFrequency,
  DashboardCalc,
  UpcomingExpenses,
  UpcomingIncomes,
  Snapshot,
  SnapshotPrompt,
} from '@cfp/shared';

type DashboardCalcV2 = DashboardCalc & {
  prompt: SnapshotPrompt | null;
  currentSnapshots: Snapshot[];
  upcoming_expenses: UpcomingExpenses;
  upcoming_incomes: UpcomingIncomes;
  total_expense: number;
  total_income: number;
  net_flow: number;
};

// dashboard API 完整响应（含周期切换新字段）
type DashboardResponse = {
  calc: any;
  cycle_offset: number;
  cycle_id: string;
  cycle_start: string;
  cycle_end: string;
  is_predicted: boolean;
  snapshot_based: boolean;
  has_history: boolean;
};

export function Overview() {
  // 全局 store（本期数据 + 基础列表）
  const storeCalc = useStore((s) => s.calc);
  const cashSources = useStore((s) => s.cashSources);
  const config = useStore((s) => s.config);
  const loading = useStore((s) => s.loading);
  const storeSnapshots = useStore((s) => s.snapshots);

  // 周期切换本地状态
  const [cycleOffset, setCycleOffset] = useState(0);
  const [cycleCalc, setCycleCalc] = useState<DashboardCalcV2 | null>(null);
  const [cycleMeta, setCycleMeta] = useState<Omit<DashboardResponse, 'calc'> | null>(null);
  const [cycleLoading, setCycleLoading] = useState(false);

  // offset≠0 时单独拉取目标周期数据
  useEffect(() => {
    if (cycleOffset === 0) { setCycleCalc(null); setCycleMeta(null); return; }
    let cancelled = false;
    setCycleLoading(true);
    apiGet<DashboardResponse>(`/dashboard?cycle_offset=${cycleOffset}`)
      .then((data) => {
        if (cancelled) return;
        setCycleCalc(data.calc as DashboardCalcV2);
        const { calc: _calc, ...meta } = data;
        setCycleMeta(meta);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCycleLoading(false); });
    return () => { cancelled = true; };
  }, [cycleOffset]);

  const [expensesExpanded, setExpensesExpanded] = useState(false);
  const [incomesExpanded, setIncomesExpanded] = useState(false);

  // 当前显示的 calc：offset=0 用 store，其他用本地拉取结果
  const calc = cycleOffset === 0 ? storeCalc : cycleCalc;
  const isCurrentCycle = cycleOffset === 0;
  const isPredicted = cycleMeta?.is_predicted ?? false;
  const snapshotBased = cycleMeta?.snapshot_based ?? false;
  const displayCycleId = cycleMeta?.cycle_id ?? storeCalc?.cycle_id ?? '';

  if (loading && !storeCalc) return <LoadingState />;
  if (!storeCalc || !config) return <LoadingState message="初始化..." />;

  const activeCalc = calc ?? storeCalc;
  const upcomingExpenses = activeCalc.upcoming_expenses;
  const upcomingIncomes = activeCalc.upcoming_incomes;
  const totalExpense = upcomingExpenses?.grand_total ?? activeCalc.total_due;
  const totalIncome = upcomingIncomes?.total ?? 0;

  // 投资 / 消费（消费 = 信用卡+账单+订阅，不含投资）
  const totalInvestment = upcomingExpenses?.total_investments ?? 0;
  const totalConsume = (upcomingExpenses?.total_credit_card ?? 0)
    + (upcomingExpenses?.total_bills ?? 0)
    + (upcomingExpenses?.total_subscriptions ?? 0);

  // 新用户引导：本期且所有数字为 0
  const isNewUser = isCurrentCycle
    && cashSources.length === 0
    && totalIncome === 0
    && totalInvestment === 0
    && totalConsume === 0;

  // 周期进度（本期已过百分比）
  const cycleLen = activeCalc.current_cycle_day + activeCalc.days_to_payday;
  const cycleProgress = cycleLen > 0
    ? Math.min(100, Math.max(0, Math.round((activeCalc.current_cycle_day / cycleLen) * 100)))
    : 0;

  // 本期净流入（纯流量：本期收入 − 消费 − 投资，不含已有存款）— 环形图与「诚实结余」用
  const netFlow = totalIncome - totalConsume - totalInvestment;

  // ── 花费节奏（仅本期）：对比「时间进度」与「预算进度」──
  const snapshots = isCurrentCycle ? storeSnapshots : (cycleCalc?.currentSnapshots ?? []);
  const baseline = snapshots.length > 0
    ? snapshots.reduce((earliest, s) => (s.snapshot_date < earliest.snapshot_date ? s : earliest))
    : null;
  let budgetProgress: number | null = null;   // null = 无快照（不显示进度条）
  let balanceGrew = false;                     // 余额较快照增长（发薪/存款）
  if (baseline && baseline.net_available > 0) {
    const spent = baseline.net_available - activeCalc.net_available;
    if (spent <= 0) {
      // 余额没有减少（可能有收入到账），显示为"余额增长"而非 0% 空条
      balanceGrew = true;
      budgetProgress = 0;
    } else {
      budgetProgress = Math.min(100, Math.round((spent / baseline.net_available) * 100));
    }
  }

  return (
    // stagger — 每个 section 依次入场（60ms 间隔）
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-5 stagger">

      {/* Hero — 周期切换器内嵌在渐变横幅顶部 */}
      <section className="hero-gradient rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] px-5 pt-4 pb-5">

        {/* 周期导航栏 — Hero 顶部白色半透明行 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => { setCycleOffset(o => o - 1); setExpensesExpanded(false); setIncomesExpanded(false); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors text-white"
            aria-label="上一期"
          >
            <Icon name="chevron-right" size={15} className="rotate-180" />
          </button>

          <div className="flex items-center gap-2">
            {cycleLoading
              ? <Icon name="loading" size={14} className="animate-spin text-white/80" />
              : <span className="font-numeric text-[14px] font-semibold text-white">
                  {displayCycleId || '加载中'}
                </span>
            }
            {isPredicted && <span className="text-[10px] font-semibold text-white/80 bg-white/20 rounded-[var(--radius-pill)] px-2 py-0.5">预测</span>}
            {snapshotBased && <span className="text-[10px] font-semibold text-white/70 bg-white/15 rounded-[var(--radius-pill)] px-2 py-0.5">快照</span>}
            {cycleOffset !== 0 && (
              <button
                onClick={() => { setCycleOffset(0); setExpensesExpanded(false); setIncomesExpanded(false); }}
                className="text-[11px] font-semibold text-white/80 hover:text-white bg-white/15 hover:bg-white/25 rounded-[var(--radius-pill)] px-2.5 py-0.5 transition-colors"
              >
                回本期
              </button>
            )}
          </div>

          <button
            onClick={() => { setCycleOffset(o => o + 1); setExpensesExpanded(false); setIncomesExpanded(false); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors text-white"
            aria-label="下一期"
          >
            <Icon name="chevron-right" size={15} />
          </button>
        </div>

        {/* 无快照提示（过去期） */}
        {!isCurrentCycle && !isPredicted && !snapshotBased && !cycleLoading && (
          <div className="mb-3 text-[12px] text-white/70 text-center bg-white/10 rounded-[var(--radius-md)] px-3 py-2">
            该周期没有历史快照，余额数据不可用
          </div>
        )}

        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-caps font-semibold text-white/90 bg-white/20 rounded-[var(--radius-pill)] px-3 py-1 mb-3">
          {isPredicted ? '预测日均预算' : '日均可用预算'}
        </div>
        <div className="mb-1.5">
          <Money
            amount={activeCalc.daily_budget}
            size="hero"
            className="font-display !text-white drop-shadow-sm"
            animate
          />
          <span className="text-[16px] sm:text-[18px] text-white/85 font-normal ml-1.5">
            / 日
          </span>
        </div>
        <div className="text-[13px] text-white/90">
          {isCurrentCycle
            ? <>距发薪日（{activeCalc.next_payday_date}）还有 <b className="text-white font-semibold">{activeCalc.days_to_payday}</b> 天</>
            : <>{cycleMeta?.cycle_start} — {cycleMeta?.cycle_end}</>
          }
        </div>

        {/* 净可用现金 */}
        <div className="mt-4 pt-3 border-t border-white/25 flex items-baseline justify-between">
          <span className="text-[12px] text-white/85">净可用现金</span>
          <span className="font-display font-semibold text-[20px] text-white tabular-nums">
            {formatYen(activeCalc.net_available)}
          </span>
        </div>
      </section>

      {/* 花费节奏卡 — 时间进度 vs 预算进度（仅本期，且需有快照基线） */}
      {isCurrentCycle && !isNewUser && (
        <PaceCard
          timePct={cycleProgress}
          budgetPct={budgetProgress}
          balanceGrew={balanceGrew}
          daysLeft={activeCalc.days_to_payday}
        />
      )}

      {/* 收支图：有本期收入时 = 收入去向；无收入时 = 支出分布 */}
      {(totalConsume > 0 || totalInvestment > 0) && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <Icon name="pie" size={16} className="text-notion-text-secondary" strokeWidth={1.75} />
              <span>{totalIncome > 0 ? '本期收入去向' : '本期支出分布'}</span>
            </div>
          }
        >
          <FlowChartRow
            income={totalIncome}
            consume={totalConsume}
            invest={totalInvestment}
            netFlow={netFlow}
          />
          <div className="mt-3 pt-3 border-t border-[var(--c-border)] text-[11px] text-notion-text-muted leading-relaxed">
            {totalIncome > 0
              ? '净流入 = 本期收入 − 消费 − 投资（不含账户已有存款）'
              : '本期暂无周期性收入到账，仅显示支出比例分布'}
          </div>
        </Card>
      )}

      {/* 新用户引导卡（首次使用，所有数据为空时显示） */}
      {isNewUser && (
        <div className="card p-5 border-dashed border-[var(--c-border-strong)] anim-fade-up">
          <div className="text-[15px] font-semibold text-notion-text mb-1.5 tracking-tight-section">
            👋 欢迎使用现金流
          </div>
          <p className="text-[13px] text-notion-text-secondary mb-4 leading-relaxed">
            添加数据后，这里会自动计算你的日均可用预算和收支结余。从这三步开始：
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Link to="/incomes"
              className="
                group flex items-center gap-2.5 px-3 py-2.5
                rounded-[var(--radius-md)] border border-[var(--c-border)]
                bg-[var(--c-bg-elev)]
                transition-all duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
                hover:border-[var(--c-success)] hover:bg-[var(--c-success-soft)] hover:-translate-y-0.5
              ">
              <span className="flex-shrink-0 w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--c-success-soft)] flex items-center justify-center group-hover:bg-[var(--c-bg-elev)] transition-colors">
                <Icon name="income" size={14} className="text-notion-success" strokeWidth={1.75} />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-notion-text">添加收入</div>
                <div className="text-[11px] text-notion-text-muted">工资、副业等</div>
              </div>
            </Link>
            <Link to="/investments"
              className="
                group flex items-center gap-2.5 px-3 py-2.5
                rounded-[var(--radius-md)] border border-[var(--c-border)]
                bg-[var(--c-bg-elev)]
                transition-all duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
                hover:border-[var(--c-accent)] hover:bg-[var(--c-accent-soft)] hover:-translate-y-0.5
              ">
              <span className="flex-shrink-0 w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--c-accent-soft)] flex items-center justify-center group-hover:bg-[var(--c-bg-elev)] transition-colors">
                <Icon name="investment" size={14} className="text-[var(--c-accent-text)]" strokeWidth={1.75} />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-notion-text">添加投资</div>
                <div className="text-[11px] text-notion-text-muted">基金定投、积存等</div>
              </div>
            </Link>
            <Link to="/expenses"
              className="
                group flex items-center gap-2.5 px-3 py-2.5
                rounded-[var(--radius-md)] border border-[var(--c-border)]
                bg-[var(--c-bg-elev)]
                transition-all duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
                hover:border-[var(--c-warning)] hover:bg-[var(--c-warning-soft)] hover:-translate-y-0.5
              ">
              <span className="flex-shrink-0 w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--c-warning-soft)] flex items-center justify-center group-hover:bg-[var(--c-bg-elev)] transition-colors">
                <Icon name="bill" size={14} className="text-notion-warning" strokeWidth={1.75} />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-notion-text">添加消费</div>
                <div className="text-[11px] text-notion-text-muted">账单、订阅、信用卡</div>
              </div>
            </Link>
          </div>
          <p className="text-[12px] text-notion-text-muted mt-3 leading-relaxed">
            💡 在「收入」页可添加现金来源（PayPay、银行账户等），让收入数字更准确。
          </p>
        </div>
      )}


      {/* 本期支出汇总卡 */}
      {upcomingExpenses && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <Icon name="warning" size={16} className="text-notion-warning" strokeWidth={1.75} />
              <span>本期支出明细</span>
              <span className="badge badge-warning text-[10px] ml-1 px-1.5 py-0.5">
                {formatYen(totalExpense)}
              </span>
            </div>
          }
          action={
            <button
              onClick={() => setExpensesExpanded(!expensesExpanded)}
              className="btn-ghost flex items-center gap-1 text-[12px]"
            >
              <span>{expensesExpanded ? '收起' : '展开'}</span>
              <Icon
                name="chevron-down"
                size={12}
                className={`transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)] ${
                  expensesExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          }
        >
          <div
            className="grid transition-[grid-template-rows] duration-[var(--dur-medium)] ease-[var(--ease-out-expo)]"
            style={{ gridTemplateRows: expensesExpanded ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              {expensesExpanded && (
                <div className="space-y-3 text-[13px] anim-fade-up">
              {/* 信用卡 */}
              {upcomingExpenses.credit_cards.length > 0 && (
                <SubCategory title="信用卡" icon="card" total={upcomingExpenses.total_credit_card}>
                  {upcomingExpenses.credit_cards.map((ac) => (
                    <ExpenseRow
                      key={ac.card.id}
                      name={ac.card.name}
                      amount={ac.amount}
                      date={ac.due_date}
                      daysUntil={ac.days_until_due}
                    />
                  ))}
                </SubCategory>
              )}
              {/* 订阅 */}
              {upcomingExpenses.subscriptions.length > 0 && (
                <SubCategory title="订阅" icon="subscription" total={upcomingExpenses.total_subscriptions}>
                  {upcomingExpenses.subscriptions.map((s) => (
                    <ExpenseRow
                      key={s.id}
                      name={s.name}
                      amount={s.total}
                      date={s.due_date}
                      daysUntil={s.days_until}
                      inCurrentCycle={s.in_current_cycle ?? true}
                    />
                  ))}
                </SubCategory>
              )}
              {/* 账单 */}
              {upcomingExpenses.bills.length > 0 && (
                <SubCategory title="固定账单" icon="bill" total={upcomingExpenses.total_bills}>
                  {upcomingExpenses.bills.map((b) => (
                    <ExpenseRow
                      key={b.id}
                      name={b.name}
                      amount={b.total}
                      date={b.due_date}
                      daysUntil={b.days_until}
                      inCurrentCycle={b.in_current_cycle ?? true}
                    />
                  ))}
                </SubCategory>
              )}
              {/* 投资 */}
              {upcomingExpenses.investments.length > 0 && (
                <SubCategory title="固定投资" icon="investment" total={upcomingExpenses.total_investments}>
                  {upcomingExpenses.investments.map((inv) => (
                    <InvestmentExpenseRow key={inv.id} item={inv} />
                  ))}
                </SubCategory>
              )}
              {upcomingExpenses.credit_cards.length === 0 &&
                upcomingExpenses.subscriptions.length === 0 &&
                upcomingExpenses.bills.length === 0 &&
                upcomingExpenses.investments.length === 0 && (
                  <div className="text-center text-notion-text-muted text-[12px] py-4">
                    本期暂无支出明细
                  </div>
                )}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 本期收入汇总卡 */}
      {upcomingIncomes && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <Icon name="trending-up" size={16} className="text-notion-success" strokeWidth={1.75} />
              <span>本期收入明细</span>
              <span className="badge text-[10px] ml-1 px-1.5 py-0.5">{formatYen(totalIncome)}</span>
            </div>
          }
          action={
            <button
              onClick={() => setIncomesExpanded(!incomesExpanded)}
              className="btn-ghost flex items-center gap-1 text-[12px]"
            >
              <span>{incomesExpanded ? '收起' : '展开'}</span>
              <Icon
                name="chevron-down"
                size={12}
                className={`transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)] ${
                  incomesExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          }
        >
          <div
            className="grid transition-[grid-template-rows] duration-[var(--dur-medium)] ease-[var(--ease-out-expo)]"
            style={{ gridTemplateRows: incomesExpanded ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              {incomesExpanded && (
                <div className="space-y-2 text-[13px] anim-fade-up">
                  {upcomingIncomes.items.length === 0 ? (
                    <div className="text-center text-notion-text-muted text-[12px] py-4">
                      本期暂无收入明细
                    </div>
                  ) : (
                    upcomingIncomes.items.map((inc, i) => <IncomeRow key={`${inc.id}-${i}`} item={inc} />)
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 现金来源已并入「收入」页（收入 = 现金余额 + 本期到账） */}
    </div>
  );
}

// ============================================================
// 内部子组件（仅总览页展示用）
// ============================================================

// ── 花费节奏卡：对比「时间进度」与「预算进度」──
function PaceCard({
  timePct,
  budgetPct,
  balanceGrew,
  daysLeft,
}: {
  timePct: number;
  budgetPct: number | null;
  balanceGrew: boolean;
  daysLeft: number;
}) {
  const titleNode = (
    <div className="flex items-center gap-2">
      <Icon name="gauge" size={16} className="text-notion-text-secondary" strokeWidth={1.75} />
      <span>花费节奏</span>
    </div>
  );

  // 无快照：引导录入
  if (budgetPct === null) {
    return (
      <Card title={titleNode}>
        <ProgressBar label="时间" pct={timePct} color="var(--c-text-muted)" />
        <p className="mt-3 text-[12px] text-notion-text-muted leading-relaxed">
          录入一次本期快照后，这里会对比「时间进度」与「预算进度」，告诉你花得快还是慢。
        </p>
      </Card>
    );
  }

  // 余额较快照增长（收入到账/存款），显示为"净增"而非 0% 空条
  if (balanceGrew) {
    return (
      <Card
        title={titleNode}
        action={<span className="badge text-[10px] px-2 py-0.5 text-notion-success bg-[var(--c-success-soft)]">余额增长</span>}
      >
        <ProgressBar label="时间" pct={timePct} color="var(--c-text-muted)" />
        <div className="flex items-center gap-2 mt-2.5">
          <span className="text-[12px] text-notion-text-muted w-8 flex-shrink-0">预算</span>
          <div className="flex-1 h-2 rounded-[var(--radius-pill)] bg-[var(--c-bg-alt)] overflow-hidden flex items-center px-2">
            <span className="text-[10px] text-notion-success font-semibold">↑ 余额较快照时有所增加</span>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-notion-text-secondary leading-relaxed">
          时间过了 <b className="font-semibold">{timePct}%</b>，但你的净可用余额比记录快照时还高——有收入到账或余额增加，节奏非常好。
        </p>
      </Card>
    );
  }

  // 正常消费进度
  const ahead = budgetPct <= timePct;
  const synced = !ahead && budgetPct <= timePct + 12;
  const verdict = ahead
    ? { label: '进度健康', cls: 'text-notion-success bg-[var(--c-success-soft)]',
        text: <>时间过了 <b className="font-semibold">{timePct}%</b>，预算只用了 <b className="font-semibold">{budgetPct}%</b> — 领先了，可以稍微放松。</> }
    : synced
    ? { label: '基本同步', cls: 'text-notion-text-secondary bg-[var(--c-bg-alt)]',
        text: <>时间 <b className="font-semibold">{timePct}%</b> / 预算已用 <b className="font-semibold">{budgetPct}%</b> — 节奏基本同步。</> }
    : { label: '花得偏快', cls: 'text-notion-warning bg-[var(--c-warning-soft)]',
        text: <>时间才过 <b className="font-semibold">{timePct}%</b>，预算已用 <b className="font-semibold">{budgetPct}%</b> — 剩 {daysLeft} 天，注意控制支出。</> };
  const budgetColor = ahead ? 'var(--c-success)' : synced ? 'var(--c-accent)' : 'var(--c-warning)';

  return (
    <Card
      title={titleNode}
      action={<span className={`badge text-[10px] px-2 py-0.5 ${verdict.cls}`}>{verdict.label}</span>}
    >
      <div className="space-y-2.5">
        <ProgressBar label="时间" pct={timePct} color="var(--c-text-muted)" />
        <ProgressBar label="预算" pct={budgetPct} color={budgetColor} />
      </div>
      <p className="mt-3 text-[12px] text-notion-text-secondary leading-relaxed">
        {verdict.text}
      </p>
    </Card>
  );
}

function ProgressBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[12px] text-notion-text-muted w-8 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-[var(--radius-pill)] bg-[var(--c-bg-alt)] overflow-hidden">
        <div
          className="h-full rounded-[var(--radius-pill)] transition-[width] duration-[var(--dur-deliberate)] ease-[var(--ease-out-expo)]"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[12px] font-numeric text-notion-text-secondary w-9 text-right flex-shrink-0">{pct}%</span>
    </div>
  );
}


function SubCategory({
  title,
  icon,
  total,
  children,
}: {
  title: string;
  icon: 'card' | 'bill' | 'subscription' | 'investment';
  total: number;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] text-notion-text-secondary mb-2 tracking-tight-section">
        <div className="flex items-center gap-1.5">
          <Icon name={icon} size={12} strokeWidth={1.75} />
          <span className="font-semibold uppercase tracking-caps text-[11px]">{title}</span>
        </div>
        <span className="font-numeric font-semibold">{formatYen(total)}</span>
      </div>
      <div className="space-y-1.5 pl-4">{children}</div>
    </div>
  );
}

function ExpenseRow({
  name,
  amount,
  date,
  daysUntil,
  inCurrentCycle = true,
}: {
  name: string;
  amount: number;
  date: string;
  daysUntil: number;
  inCurrentCycle?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[13px] py-1">
      <div className="flex-1 min-w-0">
        <span className={inCurrentCycle ? 'text-notion-text' : 'text-notion-text-muted'}>
          {name}
        </span>
        <span className="text-notion-text-muted ml-2 text-[11px]">
          {date}
          {daysUntil > 0 && <span> · {daysUntil} 天后</span>}
          {daysUntil === 0 && <span> · 今天</span>}
          {!inCurrentCycle && <span className="ml-1 text-notion-text-muted">· 下期扣款</span>}
        </span>
      </div>
      <span
        className={`font-numeric font-semibold ${
          inCurrentCycle ? 'text-notion-warning' : 'text-notion-text-muted'
        }`}
      >
        {formatYen(amount)}
      </span>
    </div>
  );
}

function InvestmentExpenseRow({ item }: { item: UpcomingExpenseItem }) {
  const freqLabel: Record<InvestmentFrequency, string> = {
    daily: '每天',
    weekly: '每周',
    monthly: '每月',
    yearly: '每年',
  };
  return (
    <div className="flex items-center justify-between text-[13px] py-1">
      <div className="flex-1 min-w-0">
        <span className="text-notion-text">{item.name}</span>
        <span className="text-notion-text-muted ml-2 text-[11px]">
          {freqLabel[item.frequency ?? 'monthly']} × {item.occurrences} 次
        </span>
      </div>
      <span className="font-numeric font-semibold text-notion-warning">{formatYen(item.total)}</span>
    </div>
  );
}

function IncomeRow({ item }: { item: UpcomingIncomeItem }) {
  return (
    <div className="flex items-center justify-between text-[13px] py-1">
      <div className="flex-1 min-w-0">
        <span className="text-notion-text">{item.name}</span>
        <span className="text-notion-text-muted ml-2 text-[11px]">
          {item.pay_date}
          {item.days_until > 0 && <span> · {item.days_until} 天后</span>}
          {item.days_until === 0 && <span> · 今天</span>}
        </span>
      </div>
      <span className="font-numeric font-semibold text-notion-success">+{formatYen(item.amount)}</span>
    </div>
  );
}

// ── 本期收入去向环形图 ──────────────────────────────────────────────────────
// 分母 = 本期收入（纯流量）。消费 + 投资 + 净流入 = 本期收入。
// 若超支（净流入<0），分母退化为本期支出，并单列「超支」。

type DonutSeg = { value: number; color: string; label: string };

function FlowChartRow({
  income, consume, invest, netFlow,
}: { income: number; consume: number; invest: number; netFlow: number }) {
  const hasIncome = income > 0;
  // 有收入时：超支 = 净流入为负；无收入时：纯支出分布，不存在"超支"概念
  const overspend = hasIncome && netFlow < 0;

  const segments: DonutSeg[] = [
    { value: consume, color: 'var(--c-warning)', label: '消费' },
    { value: invest,  color: 'var(--c-accent)',  label: '投资' },
    ...(hasIncome && netFlow > 0 ? [{ value: netFlow, color: 'var(--c-success)', label: '净流入' }] : []),
  ].filter(s => s.value > 0);

  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  // 中心标签：有收入显示收入额，无收入显示支出总额
  const centerLabel = hasIncome ? '本期收入' : '本期支出';
  const centerValue = hasIncome ? income : total;

  return (
    <div className="flex items-center gap-4">
      <FlowDonut segments={segments} centerLabel={centerLabel} centerValue={centerValue} />
      <div className="flex-1 min-w-0 space-y-1.5">
        {segments.map((seg) => {
          const pct = Math.round((seg.value / total) * 100);
          const isNet = seg.label === '净流入';
          return (
            <div key={seg.label} className="flex items-center gap-2 text-[12px]">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: seg.color }} />
              <span className={`flex-shrink-0 ${isNet ? 'text-notion-success font-semibold' : 'text-notion-text-muted'}`}>
                {seg.label}
              </span>
              <span className={`font-numeric ml-auto ${isNet ? 'text-notion-success font-semibold' : 'text-notion-text'}`}>
                {isNet ? `+${formatYen(seg.value)}` : formatYen(seg.value)}
              </span>
              <span className={`w-8 text-right flex-shrink-0 ${isNet ? 'text-notion-success font-semibold' : 'text-notion-text-muted'}`}>
                {pct}%
              </span>
            </div>
          );
        })}
        {/* 超支行：仅在有收入且支出超过收入时显示 */}
        {overspend && (
          <div className="flex items-center gap-2 text-[12px] pt-1.5 border-t border-[var(--c-border)] mt-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 bg-[var(--c-warning)]" />
            <span className="text-notion-warning font-semibold flex-shrink-0">超支</span>
            <span className="font-numeric text-notion-warning font-semibold ml-auto">{formatYen(netFlow)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FlowDonut({
  segments, centerLabel, centerValue,
}: { segments: DonutSeg[]; centerLabel: string; centerValue: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  const cx = 50, cy = 50, R = 45, rInner = 33;
  const hasGap = segments.length > 1;
  let angle = -Math.PI / 2;

  const arcs = segments.map((seg) => {
    const sweep = (seg.value / total) * 2 * Math.PI;
    const gap = hasGap ? 0.04 : 0;
    const sa = angle + gap / 2;
    const ea = angle + sweep - gap / 2;
    angle += sweep;
    const actualSweep = ea - sa;
    if (actualSweep <= 0) return null;
    const large = actualSweep > Math.PI ? 1 : 0;
    const cos1 = Math.cos(sa), sin1 = Math.sin(sa);
    const cos2 = Math.cos(ea), sin2 = Math.sin(ea);
    return {
      d: [
        `M${cx + R * cos1},${cy + R * sin1}`,
        `A${R},${R},0,${large},1,${cx + R * cos2},${cy + R * sin2}`,
        `L${cx + rInner * cos2},${cy + rInner * sin2}`,
        `A${rInner},${rInner},0,${large},0,${cx + rInner * cos1},${cy + rInner * sin1}`,
        'Z',
      ].join(' '),
      color: seg.color,
    };
  }).filter(Boolean) as { d: string; color: string }[];

  return (
    <svg
      width="104" height="104"
      viewBox="0 0 100 100"
      className="flex-shrink-0"
      role="img"
      aria-label={`${centerLabel} ${formatYen(centerValue)}`}
    >
      {arcs.map((arc, i) => (
        <path key={i} d={arc.d} style={{ fill: arc.color }} />
      ))}
      <text x="50" y="46" textAnchor="middle" style={{ fontSize: '7px', fill: 'var(--c-text-muted)' }}>
        {centerLabel}
      </text>
      <text
        x="50" y="59" textAnchor="middle"
        className="font-numeric"
        style={{ fontSize: '11px', fontWeight: 600, fill: 'var(--c-text)' }}
      >
        {formatYen(centerValue)}
      </text>
    </svg>
  );
}
