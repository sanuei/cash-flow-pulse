import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Card } from '../components/Card';
import { Money } from '../components/Money';
import { LoadingState } from '../components/States';
import { CashForm } from '../components/CashForm';
import { Icon } from '../components/Icon';
import { ManagedListCard } from '../components/ManagedListCard';
import { EntityRow } from '../components/EntityRow';
import { formatYen } from '@cfp/shared';
import { apiGet } from '../lib/api';
import type {
  CashSource,
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
  const prompt = useStore((s) => s.prompt);
  const loading = useStore((s) => s.loading);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteCash = useStore((s) => s.deleteCash);
  const recordSnapshot = useStore((s) => s.recordSnapshot);

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
  const [snapshotSaving, setSnapshotSaving] = useState(false);

  // 当前显示的 calc：offset=0 用 store，其他用本地拉取结果
  const calc = cycleOffset === 0 ? storeCalc : cycleCalc;
  const isCurrentCycle = cycleOffset === 0;
  const isPredicted = cycleMeta?.is_predicted ?? false;
  const snapshotBased = cycleMeta?.snapshot_based ?? false;
  const hasHistory = cycleMeta?.has_history ?? true;
  const displayCycleId = cycleMeta?.cycle_id ?? storeCalc?.cycle_id ?? '';

  if (loading && !storeCalc) return <LoadingState />;
  if (!storeCalc || !config) return <LoadingState message="初始化..." />;

  const onRecordSnapshot = async () => {
    if (!prompt) return;
    setSnapshotSaving(true);
    try {
      await recordSnapshot(prompt.cycle_id, prompt.offset_index);
      await loadDashboard();
    } finally {
      setSnapshotSaving(false);
    }
  };

  const activeCalc = calc ?? storeCalc;
  const upcomingExpenses = activeCalc.upcoming_expenses;
  const upcomingIncomes = activeCalc.upcoming_incomes;
  const totalExpense = upcomingExpenses?.grand_total ?? activeCalc.total_due;
  const totalIncome = upcomingIncomes?.total ?? 0;

  // 公式数据：收入 − 投资 = 理论可消费；实际消费 = 信用卡+账单+订阅（不含投资）
  const totalInvestment = upcomingExpenses?.total_investments ?? 0;
  const totalConsume = (upcomingExpenses?.total_credit_card ?? 0)
    + (upcomingExpenses?.total_bills ?? 0)
    + (upcomingExpenses?.total_subscriptions ?? 0);
  // 收入 = 手头净现金（余额-锁定）+ 本期到账收入
  const formulaIncome = activeCalc.total_net_cash + totalIncome;
  const theoretical = formulaIncome - totalInvestment;  // 理论可消费
  const formulaBalance = theoretical - totalConsume;    // 结余（正=盈余，负=超支）

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">

      {/* 周期切换器 */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => { setCycleOffset(o => o - 1); setExpensesExpanded(false); setIncomesExpanded(false); }}
          className="p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors text-notion-text-secondary hover:text-notion-text"
          aria-label="上一期"
        >
          <Icon name="chevron-right" size={18} className="rotate-180" />
        </button>
        <div className="flex items-center gap-2 text-sm font-semibold text-notion-text min-w-[7rem] justify-center">
          {cycleLoading
            ? <Icon name="loading" size={16} className="animate-spin text-notion-text-muted" />
            : <span>{displayCycleId || '加载中'}</span>
          }
          {isPredicted && (
            <span className="badge text-[10px] px-1.5 py-0.5 bg-notion-blue/10 text-notion-blue border-notion-blue/20">预测</span>
          )}
          {snapshotBased && (
            <span className="badge text-[10px] px-1.5 py-0.5">历史快照</span>
          )}
          {!isCurrentCycle && !isPredicted && !snapshotBased && !cycleLoading && (
            <span className="badge-muted badge text-[10px] px-1.5 py-0.5">无快照</span>
          )}
        </div>
        <button
          onClick={() => { setCycleOffset(o => o + 1); setExpensesExpanded(false); setIncomesExpanded(false); }}
          className="p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors text-notion-text-secondary hover:text-notion-text"
          aria-label="下一期"
        >
          <Icon name="chevron-right" size={18} />
        </button>
        {cycleOffset !== 0 && (
          <button
            onClick={() => { setCycleOffset(0); setExpensesExpanded(false); setIncomesExpanded(false); }}
            className="text-xs text-notion-text-muted hover:text-notion-text transition-colors"
          >
            回本期
          </button>
        )}
      </div>

      {/* 无快照提示（过去期没录过） */}
      {!isCurrentCycle && !isPredicted && !snapshotBased && !cycleLoading && (
        <div className="bg-notion-bg-alt border border-notion-border rounded-comfortable px-4 py-3 text-sm text-notion-text-secondary text-center">
          该周期没有历史快照，余额 / 日均预算数据不可用。固定收支安排按规则推算。
        </div>
      )}

      {/* Hero - 日均预算 */}
      <section className="text-center pt-4 pb-6">
        <div className="text-xs uppercase tracking-wider text-notion-text-muted mb-2">
          {isPredicted ? '预测日均预算' : '日均可用预算'}
        </div>
        <div className="mb-3">
          <Money amount={activeCalc.daily_budget} size="hero" className="tracking-tight-display" />
          <span className="text-2xl sm:text-3xl text-notion-text-secondary font-medium ml-2">/ 日</span>
        </div>
        <div className="text-sm text-notion-text-secondary">
          {isCurrentCycle
            ? <>距离下个发薪日（{activeCalc.next_payday_date}）还有 <b className="text-notion-text font-semibold">{activeCalc.days_to_payday}</b> 天</>
            : <>{cycleMeta?.cycle_start} — {cycleMeta?.cycle_end}</>
          }
        </div>
      </section>

      {/* 公式卡：收入 − 投资 = 消费 */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="sparkle" size={18} className="text-notion-text-secondary" strokeWidth={1.75} />
            <span>收入 − 投资 = 消费</span>
          </div>
        }
      >
        {/* 三列：整列可点击跳转，无多余「管理」链接 */}
        <div className="grid grid-cols-3 divide-x divide-notion-border mb-4 -mx-1">
          <FormulaCol label="收入" sublabel="含现金余额" amount={formulaIncome} to="/incomes" />
          <FormulaCol label="投资" amount={totalInvestment} to="/investments" />
          <FormulaCol label="消费" amount={totalConsume} to="/expenses" />
        </div>

        {/* 等式行 + 结余：只有结果数字有颜色 */}
        <div className="border-t border-notion-border pt-3 space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-xs text-notion-text-muted flex-wrap">
            <span className="font-numeric text-notion-text">{formatYen(formulaIncome)}</span>
            <span>−</span>
            <span className="font-numeric text-notion-text">{formatYen(totalInvestment)}</span>
            <span>−</span>
            <span className="font-numeric text-notion-text">{formatYen(totalConsume)}</span>
            <span>=</span>
            <span className={`font-semibold font-numeric ${formulaBalance >= 0 ? 'text-notion-success' : 'text-notion-warning'}`}>
              {formulaBalance >= 0 ? `+${formatYen(formulaBalance)}` : formatYen(formulaBalance)}
            </span>
          </div>

          <div className={`text-center text-base font-bold font-numeric py-2 rounded-micro ${
            formulaBalance >= 0
              ? 'text-notion-success bg-notion-success/5'
              : 'text-notion-warning bg-notion-warning/5'
          }`}>
            {formulaBalance >= 0 ? '结余' : '超支'}&nbsp;
            {formulaBalance >= 0 ? `+${formatYen(formulaBalance)}` : formatYen(formulaBalance)}
          </div>
        </div>
      </Card>

      {/* 采集点提示条（仅本期显示） */}
      {isCurrentCycle && prompt && (
        <div className="bg-notion-bg-alt border border-notion-border rounded-comfortable px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-white border border-notion-border flex items-center justify-center">
              <Icon name="pin" size={16} className="text-notion-blue" />
            </div>
            <div className="flex-1 text-sm min-w-0">
              <div className="font-semibold text-notion-text">
                今天到了第 {prompt.offset_index + 1} 个采集点
              </div>
              <div className="text-notion-text-secondary text-xs mt-0.5">
                {prompt.exists ? '已录入，可更新' : '点击录入本月快照'}（周期第 {prompt.cycle_day} 天）
              </div>
            </div>
          </div>
          <button
            className="btn-primary text-sm flex-shrink-0"
            disabled={snapshotSaving}
            onClick={onRecordSnapshot}
          >
            {snapshotSaving ? '保存中...' : prompt.exists ? '更新' : '录入'}
          </button>
        </div>
      )}

      {/* 摘要卡片（含本期支出/收入两行） */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="sparkle" size={18} className="text-notion-blue" strokeWidth={1.75} />
            <span>本期概览</span>
          </div>
        }
      >
        {/* 输入项：现金 + 收支 */}
        <dl className="divide-y divide-notion-border">
          <Row label="现金来源总额" value={formatYen(activeCalc.total_balance)} />
          <Row
            label="锁定金额"
            value={`-${formatYen(activeCalc.total_locked)}`}
            muted
            icon={<Icon name="lock" size={14} className="text-notion-text-muted" />}
          />
          <Row
            label="本期支出（含订阅）"
            value={`-${formatYen(totalExpense)}`}
            warning={totalExpense > 0}
            icon={<Icon name="warning" size={14} className="text-notion-warning" />}
            onClick={() => setExpensesExpanded(!expensesExpanded)}
            collapsible
            expanded={expensesExpanded}
          />
          <Row
            label="本期收入"
            value={`+${formatYen(totalIncome)}`}
            success={totalIncome > 0}
            icon={<Icon name="trending-up" size={14} className="text-notion-success" />}
            onClick={() => setIncomesExpanded(!incomesExpanded)}
            collapsible
            expanded={incomesExpanded}
          />
        </dl>

        {/* 结果项：净可用 + 日均（视觉上与输入项分开）*/}
        <dl className="divide-y divide-notion-border mt-3 pt-3 border-t-2 border-notion-border">
          <Row label="净可用现金" value={formatYen(activeCalc.net_available)} bold />
          <Row
            label="日均预算"
            value={`${formatYen(activeCalc.daily_budget)} / 日`}
            bold
            highlight
          />
        </dl>
      </Card>

      {/* 本期支出汇总卡 */}
      {upcomingExpenses && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <Icon name="warning" size={18} className="text-notion-warning" strokeWidth={1.75} />
              <span>本期支出明细</span>
              <span className="badge-warning badge text-[10px] ml-1">
                {formatYen(totalExpense)}
              </span>
            </div>
          }
          action={
            <button
              onClick={() => setExpensesExpanded(!expensesExpanded)}
              className="btn-ghost flex items-center gap-1 text-xs"
            >
              <span>{expensesExpanded ? '收起' : '展开'}</span>
              <Icon name={expensesExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
            </button>
          }
        >
          {expensesExpanded && (
            <div className="space-y-3 text-sm">
              {/* 信用卡 */}
              {upcomingExpenses.credit_cards.length > 0 && (
                <SubCategory title="信用卡" icon="card" total={upcomingExpenses.total_credit_card}>
                  {upcomingExpenses.credit_cards.map((ac) => (
                    <ExpenseRow
                      key={ac.card.id}
                      name={ac.card.name}
                      amount={ac.card.statement_amount}
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
                  <div className="text-center text-notion-text-muted text-xs py-4">
                    本期暂无支出明细
                  </div>
                )}
            </div>
          )}
        </Card>
      )}

      {/* 本期收入汇总卡 */}
      {upcomingIncomes && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <Icon name="trending-up" size={18} className="text-notion-success" strokeWidth={1.75} />
              <span>本期收入明细</span>
              <span className="badge text-[10px] ml-1">{formatYen(totalIncome)}</span>
            </div>
          }
          action={
            <button
              onClick={() => setIncomesExpanded(!incomesExpanded)}
              className="btn-ghost flex items-center gap-1 text-xs"
            >
              <span>{incomesExpanded ? '收起' : '展开'}</span>
              <Icon name={incomesExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
            </button>
          }
        >
          {incomesExpanded && (
            <div className="space-y-2 text-sm">
              {upcomingIncomes.items.length === 0 ? (
                <div className="text-center text-notion-text-muted text-xs py-4">
                  本期暂无收入明细
                </div>
              ) : (
                upcomingIncomes.items.map((inc, i) => <IncomeRow key={`${inc.id}-${i}`} item={inc} />)
              )}
            </div>
          )}
        </Card>
      )}

      {/* 现金来源（仅本期可编辑，其他周期仅展示历史值） */}
      <ManagedListCard<CashSource>
        icon="cash"
        label="现金来源"
        count={cashSources.length}
        empty={{
          icon: 'cash',
          title: '还没有现金来源',
          description: '添加 PayPay、钱包现金、银行活期等',
          addLabel: '添加第一个',
        }}
        formTitle={(e) => (e ? '编辑现金来源' : '新增现金来源')}
        renderForm={(editing, close) => (
          <CashForm
            initial={editing ?? undefined}
            onSubmit={async (data) => {
              if (editing) await useStore.getState().updateCash(editing.id, data);
              else await useStore.getState().addCash(data);
              await loadDashboard();
              close();
            }}
          />
        )}
      >
        {(openEdit) =>
          cashSources.map((cs) => (
            <EntityRow
              key={cs.id}
              title={cs.name}
              subtitle={
                <span className="font-numeric flex items-center gap-2">
                  <span>余额 {formatYen(cs.balance)}</span>
                  {cs.locked_amount > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <Icon name="lock" size={10} />
                      <span>锁定 {formatYen(cs.locked_amount)}</span>
                    </span>
                  )}
                </span>
              }
              money={<Money amount={cs.balance - cs.locked_amount} size="md" />}
              onEdit={() => openEdit(cs)}
              onDelete={async () => {
                if (confirm(`删除「${cs.name}」？`)) {
                  await deleteCash(cs.id);
                  await loadDashboard();
                }
              }}
            />
          ))
        }
      </ManagedListCard>
    </div>
  );
}

// ============================================================
// 内部子组件（仅总览页展示用）
// ============================================================

function FormulaCol({
  label,
  sublabel,
  amount,
  to,
}: {
  label: string;
  sublabel?: string;
  amount: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center gap-1 py-3 px-2 rounded-micro hover:bg-notion-bg-alt transition-colors"
    >
      <div className="text-xs text-notion-text-muted">{label}</div>
      {/* 固定高度保证三列等高 */}
      <div className="text-[10px] text-notion-text-muted/60 h-4 leading-4">
        {sublabel ?? ''}
      </div>
      <div className="text-lg sm:text-xl font-bold font-numeric text-notion-text group-hover:text-notion-blue transition-colors">
        {formatYen(amount)}
      </div>
    </Link>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  warning,
  success,
  highlight,
  icon,
  onClick,
  collapsible,
  expanded,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  warning?: boolean;
  success?: boolean;
  highlight?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  collapsible?: boolean;
  expanded?: boolean;
  divider?: boolean;
}) {
  const cursorClass = onClick ? 'cursor-pointer hover:bg-notion-bg-alt/50' : '';

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between py-2.5 px-2 -mx-2 rounded-micro transition-colors ${cursorClass}`}
    >
      <dt
        className={`text-sm flex items-center gap-1.5 ${
          muted ? 'text-notion-text-muted' : 'text-notion-text-secondary'
        }`}
      >
        {icon}
        <span>{label}</span>
        {collapsible && (
          <Icon
            name={expanded ? 'chevron-down' : 'chevron-right'}
            size={12}
            className="text-notion-text-muted ml-0.5"
          />
        )}
      </dt>
      <dd
        className={`font-numeric text-sm ${
          highlight ? 'text-base font-bold text-notion-text' : bold ? 'font-bold text-notion-text' : ''
        } ${warning ? 'text-notion-warning' : ''} ${success ? 'text-notion-success' : ''} ${muted ? 'text-notion-text-muted' : ''}`}
      >
        {value}
      </dd>
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
      <div className="flex items-center justify-between text-xs text-notion-text-secondary mb-2">
        <div className="flex items-center gap-1.5">
          <Icon name={icon} size={12} />
          <span className="font-medium">{title}</span>
        </div>
        <span className="font-numeric">{formatYen(total)}</span>
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
    <div className="flex items-center justify-between text-sm">
      <div className="flex-1 min-w-0">
        <span className={inCurrentCycle ? 'text-notion-text' : 'text-notion-text-muted'}>{name}</span>
        <span className="text-notion-text-muted ml-2 text-xs">
          {date}
          {daysUntil > 0 && <span> · {daysUntil} 天后</span>}
          {daysUntil === 0 && <span> · 今天</span>}
          {!inCurrentCycle && <span className="ml-1 text-notion-text-muted">· 下期扣款</span>}
        </span>
      </div>
      <span className={`font-numeric ${inCurrentCycle ? 'text-notion-warning' : 'text-notion-text-muted'}`}>
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
    <div className="flex items-center justify-between text-sm">
      <div className="flex-1 min-w-0">
        <span className="text-notion-text">{item.name}</span>
        <span className="text-notion-text-muted ml-2 text-xs">
          {freqLabel[item.frequency ?? 'monthly']} × {item.occurrences} 次
        </span>
      </div>
      <span className="font-numeric text-notion-warning">{formatYen(item.total)}</span>
    </div>
  );
}

function IncomeRow({ item }: { item: UpcomingIncomeItem }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex-1 min-w-0">
        <span className="text-notion-text">{item.name}</span>
        <span className="text-notion-text-muted ml-2 text-xs">
          {item.pay_date}
          {item.days_until > 0 && <span> · {item.days_until} 天后</span>}
          {item.days_until === 0 && <span> · 今天</span>}
        </span>
      </div>
      <span className="font-numeric text-notion-success">+{formatYen(item.amount)}</span>
    </div>
  );
}
