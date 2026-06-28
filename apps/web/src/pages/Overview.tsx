import { useState, useEffect, type ReactNode, Children, isValidElement, cloneElement, type ReactElement } from 'react';
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
  const totalBills = upcomingExpenses?.total_bills ?? 0;
  const totalSubs  = upcomingExpenses?.total_subscriptions ?? 0;
  const totalConsume = (upcomingExpenses?.total_credit_card ?? 0) + totalBills + totalSubs;

  // 本期净流入（有收入时）/ 账户真实结余（无收入时）
  // 无收入时：net_available 已扣信用卡，再扣账单+订阅+投资 = 现金真实剩余
  const netFlow = totalIncome > 0
    ? totalIncome - totalConsume - totalInvestment
    : activeCalc.net_available - totalBills - totalSubs - totalInvestment;

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

  // (netFlow 已在上方统一计算)

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

      {/* Hero — 磨砂玻璃面板（深色字 + 单一强调色点缀，无大色块） */}
      <section className="hero-glass px-5 pt-4 pb-5">

        {/* 周期导航栏 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => { setCycleOffset(o => o - 1); setExpensesExpanded(false); setIncomesExpanded(false); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--c-bg-alt)] hover:bg-[var(--c-bg-elev)] transition-colors text-notion-text-secondary"
            aria-label="上一期"
          >
            <Icon name="chevron-right" size={15} className="rotate-180" />
          </button>

          <div className="flex items-center gap-2">
            {cycleLoading
              ? <Icon name="loading" size={14} className="animate-spin text-notion-text-muted" />
              : <span className="font-numeric text-[14px] font-semibold text-notion-text">
                  {displayCycleId || '加载中'}
                </span>
            }
            {isPredicted && <span className="badge text-[10px] px-2 py-0.5">预测</span>}
            {snapshotBased && <span className="badge-muted badge text-[10px] px-2 py-0.5">快照</span>}
            {cycleOffset !== 0 && (
              <button
                onClick={() => { setCycleOffset(0); setExpensesExpanded(false); setIncomesExpanded(false); }}
                className="text-[11px] font-semibold text-[var(--c-accent-text)] hover:text-[var(--c-accent)] bg-[var(--c-accent-soft)] rounded-[var(--radius-pill)] px-2.5 py-0.5 transition-colors"
              >
                回本期
              </button>
            )}
          </div>

          <button
            onClick={() => { setCycleOffset(o => o + 1); setExpensesExpanded(false); setIncomesExpanded(false); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--c-bg-alt)] hover:bg-[var(--c-bg-elev)] transition-colors text-notion-text-secondary"
            aria-label="下一期"
          >
            <Icon name="chevron-right" size={15} />
          </button>
        </div>

        {/* 无快照提示（过去期） */}
        {!isCurrentCycle && !isPredicted && !snapshotBased && !cycleLoading && (
          <div className="mb-3 text-[12px] text-notion-text-secondary text-center bg-[var(--c-bg-alt)] rounded-[var(--radius-md)] px-3 py-2">
            该周期没有历史快照，余额数据不可用
          </div>
        )}

        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-caps font-semibold text-[var(--c-accent-text)] bg-[var(--c-accent-soft)] rounded-[var(--radius-pill)] px-3 py-1 mb-3">
          {isPredicted ? '预测日均预算' : '日均可用预算'}
        </div>
        <div className="mb-1.5">
          <Money
            amount={activeCalc.daily_budget}
            size="hero"
            className="font-display"
            color="accent"
            animate
          />
          <span className="text-[16px] sm:text-[18px] text-notion-text-secondary font-normal ml-1.5">
            / 日
          </span>
        </div>
        <div className="text-[13px] text-notion-text-secondary">
          {isCurrentCycle
            ? <>距发薪日（{activeCalc.next_payday_date}）还有 <b className="text-notion-text font-semibold">{activeCalc.days_to_payday}</b> 天</>
            : <>{cycleMeta?.cycle_start} — {cycleMeta?.cycle_end}</>
          }
        </div>

        {/* 净可用现金 */}
        <div className="mt-4 pt-3 border-t border-[var(--c-border)] flex items-baseline justify-between">
          <span className="text-[12px] text-notion-text-secondary">净可用现金</span>
          <span
            className="font-display font-semibold text-[20px] tabular-nums"
            style={{
              backgroundImage: 'linear-gradient(135deg, var(--c-accent) 0%, var(--c-accent-hover) 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
            }}
          >
            {formatYen(activeCalc.net_available)}
          </span>
        </div>
      </section>

      {/* 花费节奏卡 */}
      {isCurrentCycle && !isNewUser && (
        <PaceCard
          timePct={cycleProgress}
          budgetPct={budgetProgress}
          balanceGrew={balanceGrew}
          daysLeft={activeCalc.days_to_payday}
          cycleSnapshots={snapshots.filter(s => s.cycle_id === activeCalc.cycle_id)}
          currentNetAvailable={activeCalc.net_available}
          cycleDay={activeCalc.current_cycle_day}
          cycleLen={cycleLen}
        />
      )}

      {/* 收支图：有本期收入时 = 收入去向；无收入时 = 支出分布 */}
      {(totalConsume > 0 || totalInvestment > 0) && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <Icon name="pie" size={16} className="text-notion-text-secondary" strokeWidth={1.75} />
              <span>{totalIncome > 0 ? '本期收入去向' : netFlow > 0 ? '账户分配概览' : '本期支出分布'}</span>
            </div>
          }
        >
          <FlowChartRow
            consume={totalConsume}
            invest={totalInvestment}
            netFlow={netFlow}
            hasIncome={totalIncome > 0}
          />
          <div className="mt-3 pt-3 border-t border-[var(--c-border)] text-[11px] text-notion-text-muted leading-relaxed">
            {totalIncome > 0
              ? '结余 = 本期收入 − 消费 − 投资'
              : netFlow > 0
              ? '结余 = 净可用现金 − 账单 − 订阅 − 投资（信用卡已在净可用中扣除）'
              : '本期暂无收入到账；在「收入」页录入后可查看结余'}
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
                size={14}
                className={`transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)] ${
                  expensesExpanded ? 'rotate-180' : 'rotate-0'
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

// ── 花费节奏卡：有快照时显示净可用现金走势折线图，无快照时显示进度条 ──
function PaceCard({
  timePct, budgetPct, balanceGrew, daysLeft,
  cycleSnapshots, currentNetAvailable, cycleDay, cycleLen,
}: {
  timePct: number;
  budgetPct: number | null;
  balanceGrew: boolean;
  daysLeft: number;
  cycleSnapshots: Snapshot[];
  currentNetAvailable: number;
  cycleDay: number;
  cycleLen: number;
}) {
  // 判断是否有足够数据画折线（至少 1 个历史快照）
  const hasSparkData = cycleSnapshots.length >= 1;

  const ahead = budgetPct !== null && budgetPct <= timePct;
  const synced = budgetPct !== null && !ahead && budgetPct <= timePct + 12;
  const verdictLabel = balanceGrew ? '余额增长'
    : budgetPct === null ? '待记录'
    : ahead ? '进度健康'
    : synced ? '基本同步' : '花得偏快';
  const verdictCls = balanceGrew ? 'text-notion-success bg-[var(--c-success-soft)]'
    : budgetPct === null ? 'text-notion-text-muted bg-[var(--c-bg-alt)]'
    : ahead ? 'text-notion-success bg-[var(--c-success-soft)]'
    : synced ? 'text-notion-text-secondary bg-[var(--c-bg-alt)]'
    : 'text-notion-warning bg-[var(--c-warning-soft)]';

  const titleNode = (
    <div className="flex items-center gap-2">
      <Icon name="gauge" size={16} className="text-notion-text-secondary" strokeWidth={1.75} />
      <span>现金走势</span>
    </div>
  );

  return (
    <Card
      title={titleNode}
      action={<span className={`badge text-[10px] px-2 py-0.5 ${verdictCls}`}>{verdictLabel}</span>}
    >
      {hasSparkData ? (
        /* ── 折线图模式 ── */
        <div>
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="font-display font-semibold text-[22px] font-numeric text-notion-text">
              {formatYen(currentNetAvailable)}
            </span>
            <span className="text-[12px] text-notion-text-muted">净可用现金</span>
          </div>
          <NetSparkline
            snapshots={cycleSnapshots}
            currentValue={currentNetAvailable}
            cycleDay={cycleDay}
            cycleLen={cycleLen}
          />
          <div className="flex items-center justify-between mt-2 text-[11px] text-notion-text-muted">
            <span>周期第 {cycleDay} 天</span>
            <span>还剩 {daysLeft} 天</span>
          </div>
        </div>
      ) : (
        /* ── 进度条回退（无快照） ── */
        <div>
          <div className="space-y-2.5">
            <ProgressBar label="时间" pct={timePct} color="var(--c-text-muted)" />
            {budgetPct !== null && !balanceGrew && (
              <ProgressBar
                label="预算"
                pct={budgetPct}
                color={ahead ? 'var(--c-success)' : synced ? 'var(--c-accent)' : 'var(--c-warning)'}
              />
            )}
            {balanceGrew && (
              <div className="flex items-center gap-2.5">
                <span className="text-[12px] text-notion-text-muted w-8">预算</span>
                <span className="text-[11px] text-notion-success font-semibold">↑ 余额增长中</span>
              </div>
            )}
          </div>
          <p className="mt-3 text-[12px] text-notion-text-muted leading-relaxed">
            {budgetPct === null
              ? '每次修改数据后会自动记录快照，这里会展示净可用现金的走势曲线。'
              : balanceGrew
              ? `时间过了 ${timePct}%，余额比快照时还高 — 节奏非常好。`
              : ahead
              ? `时间 ${timePct}%，预算只用了 ${budgetPct}% — 领先了。`
              : synced
              ? `时间 ${timePct}% / 预算 ${budgetPct}% — 节奏同步。`
              : `时间 ${timePct}%，预算已用 ${budgetPct}% — 剩 ${daysLeft} 天注意控制。`}
          </p>
        </div>
      )}
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

// ── 净可用现金走势 SVG 折线图 ──────────────────────────────────────────────
function NetSparkline({
  snapshots, currentValue, cycleDay, cycleLen,
}: {
  snapshots: Snapshot[];
  currentValue: number;
  cycleDay: number;
  cycleLen: number;
}) {
  const W = 300, H = 80, PAD = 4;

  // 从 cycleDay 反推周期起始日（本地午夜）
  // 不用 Date.now() - snapshotDate 的差值，避免 UTC/本地时区不一致
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const cycleStartMs = todayMidnight.getTime() - cycleDay * 86400000;

  // 同一天只保留最后一条（UPSERT 行为，已是最新），再加今天当前值
  const dayMap = new Map<number, number>();
  for (const s of snapshots) {
    // 'YYYY-MM-DD' → 本地午夜，避免 UTC 偏移导致 off-by-1
    const snapMs = new Date(s.snapshot_date + 'T00:00:00').getTime();
    const dayInCycle = Math.max(0, Math.min(cycleLen,
      Math.round((snapMs - cycleStartMs) / 86400000)
    ));
    dayMap.set(dayInCycle, s.net_available);
  }
  dayMap.set(cycleDay, currentValue);  // 当前值覆盖今天

  let pts = [...dayMap.entries()]
    .map(([day, val]) => ({ day, val }))
    .sort((a, b) => a.day - b.day);

  // 少于 2 点时在 day 0 补一个锚点
  if (pts.length < 2) {
    const first = pts[0];
    if (first && first.day > 0) pts = [{ day: 0, val: first.val }, ...pts];
  }

  const vals = pts.map(p => p.val);
  const maxVal = Math.max(...vals, 1);
  const minVal = Math.min(...vals, 0);
  const range = maxVal - minVal || 1;

  // 关键:第一个点不一定在 day 0,要让折线从最左画满整个图表
  // 真实 x 轴区间 = [pts[0].day, cycleLen],把它等比映射到 [PAD, W-PAD]
  const firstDay = pts[0]?.day ?? 0;
  const daySpan = Math.max(cycleLen - firstDay, 1);
  const toX = (day: number) => PAD + (((day - firstDay) / daySpan) * (W - PAD * 2));
  const toY = (val: number) => H - PAD - ((val - minVal) / range) * (H - PAD * 2);

  // 平滑贝塞尔路径
  const smoothPath = (points: {x:number;y:number}[]) => {
    if (points.length < 2) return '';
    const p0 = points[0];
    if (!p0) return '';
    let d = `M${p0.x},${p0.y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      if (!prev || !curr) continue;
      const cx = (prev.x + curr.x) / 2;
      d += ` C${cx},${prev.y} ${cx},${curr.y} ${curr.x},${curr.y}`;
    }
    return d;
  };

  const xyPts = pts.map(p => ({ x: toX(p.day), y: toY(p.val) }));
  const linePath = smoothPath(xyPts);
  const lastPt = xyPts[xyPts.length - 1];
  const firstPt = xyPts[0];
  const areaPath = firstPt && lastPt
    ? `${linePath} L${lastPt.x},${H} L${firstPt.x},${H} Z`
    : '';

  // 理想参考线（从首点线性降到 0）
  const idealStartY = toY(pts[0]?.val ?? maxVal);
  const idealEndY   = toY(0);
  const idealPath   = `M${toX(pts[0]?.day ?? 0)},${idealStartY} L${toX(cycleLen)},${idealEndY}`;

  return (
    <svg
      width="100%" viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img" aria-label="净可用现金走势"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--c-accent)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--c-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* 面积填充 */}
      {areaPath && <path d={areaPath} fill="url(#sparkGrad)" />}
      {/* 理想参考虚线 */}
      <path d={idealPath} stroke="var(--c-text-muted)" strokeWidth="1.5"
        strokeDasharray="5 4" fill="none" opacity="0.4" />
      {/* 走势折线 */}
      <path d={linePath} stroke="var(--c-accent)" strokeWidth="2.5"
        fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {/* 各快照节点 */}
      {xyPts.slice(0, -1).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3"
          fill="var(--c-bg-elev)" stroke="var(--c-accent)" strokeWidth="1.5" />
      ))}
      {/* 当前点（更大，带光晕感） */}
      {lastPt && (
        <>
          <circle cx={lastPt.x} cy={lastPt.y} r="6"
            fill="var(--c-accent)" opacity="0.2" />
          <circle cx={lastPt.x} cy={lastPt.y} r="4"
            fill="var(--c-accent)" stroke="var(--c-bg-elev)" strokeWidth="2" />
        </>
      )}
    </svg>
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
  // 自动给每个 ExpenseRow / InvestmentExpenseRow 子元素注入 icon
  // 这样 4 个分类不用各自手动传 icon
  const childrenWithIcon = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    if (child.type === ExpenseRow || child.type === InvestmentExpenseRow) {
      return cloneElement(child as ReactElement<{ icon?: typeof icon }>, { icon });
    }
    return child;
  });

  return (
    <div>
      <div className="flex items-center justify-between text-[12px] text-notion-text-secondary mb-2.5 tracking-tight-section">
        <div className="flex items-center gap-1.5">
          <Icon name={icon} size={12} strokeWidth={1.75} />
          <span className="font-semibold uppercase tracking-caps text-[11px]">{title}</span>
        </div>
        <span className="font-numeric font-semibold">{formatYen(total)}</span>
      </div>
      <div className="space-y-1 pl-0.5">{childrenWithIcon}</div>
    </div>
  );
}

function ExpenseRow({
  name,
  amount,
  date,
  daysUntil,
  inCurrentCycle = true,
  icon,
}: {
  name: string;
  amount: number;
  date: string;
  daysUntil: number;
  inCurrentCycle?: boolean;
  icon?: 'card' | 'bill' | 'subscription' | 'investment';
}) {
  return (
    <div className="flex items-center gap-3 text-[13px] py-2.5 px-2 -mx-2 rounded-[var(--radius-sm)] hover:bg-[var(--c-bg-alt)] transition-colors">
      {icon && (
        <span className="flex-shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-[var(--radius-xs)] bg-[var(--c-bg-alt)] text-notion-text-secondary">
          <Icon name={icon} size={13} strokeWidth={1.75} />
        </span>
      )}
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
        className={`font-numeric font-semibold tabular-nums ${
          inCurrentCycle ? 'text-notion-warning' : 'text-notion-text-muted'
        }`}
      >
        {formatYen(amount)}
      </span>
    </div>
  );
}

function InvestmentExpenseRow({ item, icon }: { item: UpcomingExpenseItem; icon?: 'investment' }) {
  const freqLabel: Record<InvestmentFrequency, string> = {
    daily: '每天',
    weekly: '每周',
    monthly: '每月',
    yearly: '每年',
  };
  return (
    <div className="flex items-center gap-3 text-[13px] py-2.5 px-2 -mx-2 rounded-[var(--radius-sm)] hover:bg-[var(--c-bg-alt)] transition-colors">
      {icon && (
        <span className="flex-shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-[var(--radius-xs)] bg-[var(--c-bg-alt)] text-notion-text-secondary">
          <Icon name={icon} size={13} strokeWidth={1.75} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-notion-text">{item.name}</span>
        <span className="text-notion-text-muted ml-2 text-[11px]">
          {freqLabel[item.frequency ?? 'monthly']} × {item.occurrences} 次
        </span>
      </div>
      <span className="font-numeric font-semibold tabular-nums text-notion-warning">{formatYen(item.total)}</span>
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
  consume, invest, netFlow, hasIncome,
}: { consume: number; invest: number; netFlow: number; hasIncome: boolean }) {
  // 超支：只有有收入且入不敷出时才算"超支"；无收入时只是"现金不够覆盖账单"
  const overspend = hasIncome && netFlow < 0;

  const segments: DonutSeg[] = [
    { value: consume, color: 'var(--c-accent)',     label: '消费' },
    { value: invest,  color: 'var(--c-text-muted)', label: '投资' },
    ...(netFlow > 0 ? [{ value: netFlow, color: 'var(--c-success)', label: '结余' }] : []),
  ].filter(s => s.value > 0);

  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  const centerLabel = hasIncome ? '本期收入' : netFlow > 0 ? '现金分配' : '本期支出';
  const centerValue = total;

  return (
    <div className="flex items-center gap-4">
      <FlowDonut segments={segments} centerLabel={centerLabel} centerValue={centerValue} />
      <div className="flex-1 min-w-0 space-y-1.5">
        {segments.map((seg) => {
          const pct = Math.round((seg.value / total) * 100);
          const isNet = seg.label === '结余';
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
