import { useState, useMemo } from 'react';
import { useStore } from '../lib/store';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { Money } from '../components/Money';
import { EmptyState, LoadingState } from '../components/States';
import { CashForm } from '../components/CashForm';
import { CardForm } from '../components/CardForm';
import { InvestmentForm } from '../components/InvestmentForm';
import { BillForm } from '../components/BillForm';
import { IncomeForm } from '../components/IncomeForm';
import { SubscriptionForm } from '../components/SubscriptionForm';
import { Icon } from '../components/Icon';
import { formatYen } from '@cfp/shared';
import type {
  CashSource,
  CreditCard,
  RecurringInvestment,
  RecurringBill,
  RecurringIncome,
  Subscription,
  UpcomingExpenseItem,
  UpcomingIncomeItem,
  InvestmentFrequency,
} from '@cfp/shared';

export function Home() {
  const calc = useStore((s) => s.calc);
  const cashSources = useStore((s) => s.cashSources);
  const creditCards = useStore((s) => s.creditCards);
  const investments = useStore((s) => s.investments);
  const bills = useStore((s) => s.bills);
  const incomes = useStore((s) => s.incomes);
  const subscriptions = useStore((s) => s.subscriptions);
  const config = useStore((s) => s.config);
  const prompt = useStore((s) => s.prompt);
  const loading = useStore((s) => s.loading);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteCash = useStore((s) => s.deleteCash);
  const deleteCard = useStore((s) => s.deleteCard);
  const deleteInvestment = useStore((s) => s.deleteInvestment);
  const deleteBill = useStore((s) => s.deleteBill);
  const deleteIncome = useStore((s) => s.deleteIncome);
  const deleteSubscription = useStore((s) => s.deleteSubscription);
  const recordSnapshot = useStore((s) => s.recordSnapshot);

  // 编辑状态
  const [editingCash, setEditingCash] = useState<CashSource | null>(null);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [editingInvestment, setEditingInvestment] = useState<RecurringInvestment | null>(null);
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null);
  const [editingIncome, setEditingIncome] = useState<RecurringIncome | null>(null);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);

  // 新增模态状态
  const [showAddCash, setShowAddCash] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddInvestment, setShowAddInvestment] = useState(false);
  const [showAddBill, setShowAddBill] = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [showAddSubscription, setShowAddSubscription] = useState(false);

  // 折叠状态
  const [expensesExpanded, setExpensesExpanded] = useState(false);
  const [incomesExpanded, setIncomesExpanded] = useState(false);

  const [snapshotSaving, setSnapshotSaving] = useState(false);

  if (loading && !calc) return <LoadingState />;
  if (!calc || !config) return <LoadingState message="初始化..." />;

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

  // 关闭所有编辑模态的辅助
  const closeCash = () => { setShowAddCash(false); setEditingCash(null); };
  const closeCard = () => { setShowAddCard(false); setEditingCard(null); };
  const closeInvestment = () => { setShowAddInvestment(false); setEditingInvestment(null); };
  const closeBill = () => { setShowAddBill(false); setEditingBill(null); };
  const closeIncome = () => { setShowAddIncome(false); setEditingIncome(null); };
  const closeSubscription = () => { setShowAddSubscription(false); setEditingSubscription(null); };

  // 汇总卡数据
  const upcomingExpenses = calc.upcoming_expenses;
  const upcomingIncomes = calc.upcoming_incomes;
  const totalExpense = upcomingExpenses?.grand_total ?? calc.total_due;
  const totalIncome = upcomingIncomes?.total ?? 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      {/* 顶部移动端标题 */}
      <div className="sm:hidden flex items-center gap-2 font-bold text-notion-text">
        <Icon name="wallet" size={18} />
        <span>Cash Flow Pulse</span>
      </div>

      {/* Hero - 日均预算 */}
      <section className="text-center pt-4 pb-6">
        <div className="text-xs uppercase tracking-wider text-notion-text-muted mb-2">
          日均可用预算
        </div>
        <div className="mb-3">
          <Money amount={calc.daily_budget} size="hero" className="tracking-tight-display" />
          <span className="text-2xl sm:text-3xl text-notion-text-secondary font-medium ml-2">/ 日</span>
        </div>
        <div className="text-sm text-notion-text-secondary">
          距离下个发薪日（{calc.next_payday_date}）还有 <b className="text-notion-text font-semibold">{calc.days_to_payday}</b> 天
        </div>
      </section>

      {/* 采集点提示条 */}
      {prompt && (
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

      {/* 摘要卡片（升级版：含本期支出/收入两行） */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="sparkle" size={18} className="text-notion-blue" strokeWidth={1.75} />
            <span>本期概览</span>
          </div>
        }
      >
        <dl className="divide-y divide-notion-border">
          <Row label="现金来源总额" value={formatYen(calc.total_balance)} />
          <Row
            label="锁定金额"
            value={`-${formatYen(calc.total_locked)}`}
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
          <Row label="─────────────────" value="" divider />
          <Row label="净可用现金" value={formatYen(calc.net_available)} bold />
          <Row
            label="日均预算"
            value={`${formatYen(calc.daily_budget)} / 日`}
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
                    <InvestmentExpenseRow
                      key={inv.id}
                      item={inv}
                    />
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
              <span className="badge text-[10px] ml-1">
                {formatYen(totalIncome)}
              </span>
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
                upcomingIncomes.items.map((inc, i) => (
                  <IncomeRow
                    key={`${inc.id}-${i}`}
                    item={inc}
                  />
                ))
              )}
            </div>
          )}
        </Card>
      )}

      {/* 现金来源明细 */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="cash" size={18} className="text-notion-text-secondary" strokeWidth={1.75} />
            <span>现金来源 ({cashSources.length})</span>
          </div>
        }
        action={
          <button
            onClick={() => setShowAddCash(true)}
            className="btn-ghost text-notion-blue flex items-center gap-1"
          >
            <Icon name="add" size={14} strokeWidth={2} />
            <span>新增</span>
          </button>
        }
      >
        {cashSources.length === 0 ? (
          <EmptyState
            icon="cash"
            title="还没有现金来源"
            description="添加 PayPay、钱包现金、银行活期等"
            action={
              <button onClick={() => setShowAddCash(true)} className="btn-primary flex items-center gap-1.5 mx-auto">
                <Icon name="add" size={16} strokeWidth={2} />
                <span>添加第一个</span>
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-notion-border -mx-5">
            {cashSources.map((cs) => (
              <li
                key={cs.id}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-notion-bg-alt/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-notion-text truncate">{cs.name}</div>
                  <div className="text-xs text-notion-text-muted mt-0.5 font-numeric flex items-center gap-2">
                    <span>余额 {formatYen(cs.balance)}</span>
                    {cs.locked_amount > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Icon name="lock" size={10} />
                        <span>锁定 {formatYen(cs.locked_amount)}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <Money amount={cs.balance - cs.locked_amount} size="md" />
                </div>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => setEditingCash(cs)}
                    className="text-notion-text-muted hover:text-notion-blue p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                    aria-label="编辑"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`删除「${cs.name}」？`)) {
                        await deleteCash(cs.id);
                        await loadDashboard();
                      }
                    }}
                    className="text-notion-text-muted hover:text-notion-warning p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                    aria-label="删除"
                  >
                    <Icon name="close" size={14} strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 信用卡明细 */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="card" size={18} className="text-notion-text-secondary" strokeWidth={1.75} />
            <span>信用卡 ({creditCards.length})</span>
          </div>
        }
        action={
          <button
            onClick={() => setShowAddCard(true)}
            className="btn-ghost text-notion-blue flex items-center gap-1"
          >
            <Icon name="add" size={14} strokeWidth={2} />
            <span>新增</span>
          </button>
        }
      >
        {creditCards.length === 0 ? (
          <EmptyState
            icon="card"
            title="还没有信用卡"
            description="添加待还款的信用卡，填写扣款日"
            action={
              <button onClick={() => setShowAddCard(true)} className="btn-primary flex items-center gap-1.5 mx-auto">
                <Icon name="add" size={16} strokeWidth={2} />
                <span>添加卡片</span>
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-notion-border -mx-5">
            {[...calc.active_cards.map((ac) => ({ ...ac.card, active: true, due_date: ac.due_date, days_until_due: ac.days_until_due })),
              ...calc.inactive_cards.map((c) => ({ ...c, active: false, due_date: '', days_until_due: -1 })),
            ].map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-notion-bg-alt/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-notion-text truncate flex items-center gap-2">
                    {c.name}
                    {c.active ? (
                      <span className="badge-warning badge text-[10px] px-1.5 py-0.5">
                        {c.days_until_due === 0 ? '今天扣款' : `${c.days_until_due} 天后扣款`}
                      </span>
                    ) : (
                      <span className="badge-muted badge text-[10px] px-1.5 py-0.5">
                        非本期
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-notion-text-muted mt-0.5">
                    每月 {c.due_day} 号扣款 · 账单 {formatYen(c.statement_amount)}
                  </div>
                </div>
                <div className="text-right">
                  <Money
                    amount={c.statement_amount}
                    size="md"
                    sign={c.active ? 'negative' : 'neutral'}
                  />
                </div>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => setEditingCard(c)}
                    className="text-notion-text-muted hover:text-notion-blue p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                    aria-label="编辑"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`删除「${c.name}」？`)) {
                        await deleteCard(c.id);
                        await loadDashboard();
                      }
                    }}
                    className="text-notion-text-muted hover:text-notion-warning p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                    aria-label="删除"
                  >
                    <Icon name="close" size={14} strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ====== v0.3 新增的 4 张卡片 ====== */}

      {/* 固定投资 */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="investment" size={18} className="text-notion-text-secondary" strokeWidth={1.75} />
            <span>固定投资 ({investments.length})</span>
          </div>
        }
        action={
          <button
            onClick={() => setShowAddInvestment(true)}
            className="btn-ghost text-notion-blue flex items-center gap-1"
          >
            <Icon name="add" size={14} strokeWidth={2} />
            <span>新增</span>
          </button>
        }
      >
        {investments.length === 0 ? (
          <EmptyState
            icon="investment"
            title="还没有固定投资"
            description="添加基金定投、黄金积存等自动扣款项目"
            action={
              <button onClick={() => setShowAddInvestment(true)} className="btn-primary flex items-center gap-1.5 mx-auto">
                <Icon name="add" size={16} strokeWidth={2} />
                <span>添加第一个</span>
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-notion-border -mx-5">
            {investments.map((inv) => {
              const freqLabel = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }[inv.frequency];
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-notion-bg-alt/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-notion-text truncate">{inv.name}</div>
                    <div className="text-xs text-notion-text-muted mt-0.5 font-numeric">
                      {freqLabel}扣款 {formatYen(inv.amount)} · 始于 {inv.start_date}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money amount={inv.amount} size="md" sign="negative" />
                  </div>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => setEditingInvestment(inv)}
                      className="text-notion-text-muted hover:text-notion-blue p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                      aria-label="编辑"
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`删除「${inv.name}」？`)) {
                          await deleteInvestment(inv.id);
                          await loadDashboard();
                        }
                      }}
                      className="text-notion-text-muted hover:text-notion-warning p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                      aria-label="删除"
                    >
                      <Icon name="close" size={14} strokeWidth={2} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 固定账单 */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="bill" size={18} className="text-notion-text-secondary" strokeWidth={1.75} />
            <span>固定账单 ({bills.length})</span>
          </div>
        }
        action={
          <button
            onClick={() => setShowAddBill(true)}
            className="btn-ghost text-notion-blue flex items-center gap-1"
          >
            <Icon name="add" size={14} strokeWidth={2} />
            <span>新增</span>
          </button>
        }
      >
        {bills.length === 0 ? (
          <EmptyState
            icon="bill"
            title="还没有固定账单"
            description="添加房租、水电、网费等每月固定支出"
            action={
              <button onClick={() => setShowAddBill(true)} className="btn-primary flex items-center gap-1.5 mx-auto">
                <Icon name="add" size={16} strokeWidth={2} />
                <span>添加账单</span>
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-notion-border -mx-5">
            {bills.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-notion-bg-alt/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-notion-text truncate">{b.name}</div>
                  <div className="text-xs text-notion-text-muted mt-0.5">每月 {b.due_day} 号扣款</div>
                </div>
                <div className="text-right">
                  <Money amount={b.amount} size="md" sign="negative" />
                </div>
                <div className="flex gap-0.5">
                  <button onClick={() => setEditingBill(b)} className="text-notion-text-muted hover:text-notion-blue p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors" aria-label="编辑">
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`删除「${b.name}」？`)) {
                        await deleteBill(b.id);
                        await loadDashboard();
                      }
                    }}
                    className="text-notion-text-muted hover:text-notion-warning p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                    aria-label="删除"
                  >
                    <Icon name="close" size={14} strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 固定收入 */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="income" size={18} className="text-notion-text-secondary" strokeWidth={1.75} />
            <span>固定收入 ({incomes.length})</span>
          </div>
        }
        action={
          <button
            onClick={() => setShowAddIncome(true)}
            className="btn-ghost text-notion-blue flex items-center gap-1"
          >
            <Icon name="add" size={14} strokeWidth={2} />
            <span>新增</span>
          </button>
        }
      >
        {incomes.length === 0 ? (
          <EmptyState
            icon="income"
            title="还没有固定收入"
            description="添加工资、副业等自动到账项目"
            action={
              <button onClick={() => setShowAddIncome(true)} className="btn-primary flex items-center gap-1.5 mx-auto">
                <Icon name="add" size={16} strokeWidth={2} />
                <span>添加收入</span>
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-notion-border -mx-5">
            {incomes.map((inc) => {
              const freqLabel = inc.frequency === 'monthly'
                ? `每月 ${inc.pay_day} 号`
                : `每${['周日','周一','周二','周三','周四','周五','周六'][inc.day_of_week ?? 0]}`;
              return (
                <li key={inc.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-notion-bg-alt/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-notion-text truncate">{inc.name}</div>
                    <div className="text-xs text-notion-text-muted mt-0.5">{freqLabel}</div>
                  </div>
                  <div className="text-right">
                    <Money amount={inc.amount} size="md" sign="positive" />
                  </div>
                  <div className="flex gap-0.5">
                    <button onClick={() => setEditingIncome(inc)} className="text-notion-text-muted hover:text-notion-blue p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors" aria-label="编辑">
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`删除「${inc.name}」？`)) {
                          await deleteIncome(inc.id);
                          await loadDashboard();
                        }
                      }}
                      className="text-notion-text-muted hover:text-notion-warning p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                      aria-label="删除"
                    >
                      <Icon name="close" size={14} strokeWidth={2} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 订阅 */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="subscription" size={18} className="text-notion-text-secondary" strokeWidth={1.75} />
            <span>订阅 ({subscriptions.length})</span>
          </div>
        }
        action={
          <button
            onClick={() => setShowAddSubscription(true)}
            className="btn-ghost text-notion-blue flex items-center gap-1"
          >
            <Icon name="add" size={14} strokeWidth={2} />
            <span>新增</span>
          </button>
        }
      >
        {subscriptions.length === 0 ? (
          <EmptyState
            icon="subscription"
            title="还没有订阅"
            description="添加 Netflix、Spotify、iCloud 等自动续费服务"
            action={
              <button onClick={() => setShowAddSubscription(true)} className="btn-primary flex items-center gap-1.5 mx-auto">
                <Icon name="add" size={16} strokeWidth={2} />
                <span>添加订阅</span>
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-notion-border -mx-5">
            {subscriptions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-notion-bg-alt/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-notion-text truncate flex items-center gap-2">
                    {s.name}
                    <span className="badge-warning badge text-[10px] px-1.5 py-0.5">
                      {s.billing_cycle === 'monthly' ? '月' : '年'}
                    </span>
                  </div>
                  <div className="text-xs text-notion-text-muted mt-0.5">
                    {s.billing_cycle === 'monthly' ? '每月' : '每年'} {s.billing_day} 号扣款
                  </div>
                </div>
                <div className="text-right">
                  <Money amount={s.amount} size="md" sign="negative" />
                </div>
                <div className="flex gap-0.5">
                  <button onClick={() => setEditingSubscription(s)} className="text-notion-text-muted hover:text-notion-blue p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors" aria-label="编辑">
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`删除「${s.name}」？`)) {
                        await deleteSubscription(s.id);
                        await loadDashboard();
                      }
                    }}
                    className="text-notion-text-muted hover:text-notion-warning p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                    aria-label="删除"
                  >
                    <Icon name="close" size={14} strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ====== 模态框 ====== */}

      <Modal open={showAddCash || !!editingCash} onClose={closeCash} title={editingCash ? '编辑现金来源' : '新增现金来源'}>
        <CashForm
          initial={editingCash ?? undefined}
          onSubmit={async (data) => {
            if (editingCash) await useStore.getState().updateCash(editingCash.id, data);
            else await useStore.getState().addCash(data);
            await loadDashboard();
            closeCash();
          }}
        />
      </Modal>

      <Modal open={showAddCard || !!editingCard} onClose={closeCard} title={editingCard ? '编辑信用卡' : '新增信用卡'}>
        <CardForm
          initial={editingCard ? { name: editingCard.name, statement_amount: editingCard.statement_amount, due_day: editingCard.due_day } : undefined}
          onSubmit={async (data) => {
            if (editingCard) await useStore.getState().updateCard(editingCard.id, data);
            else await useStore.getState().addCard(data);
            await loadDashboard();
            closeCard();
          }}
        />
      </Modal>

      <Modal open={showAddInvestment || !!editingInvestment} onClose={closeInvestment} title={editingInvestment ? '编辑固定投资' : '新增固定投资'}>
        <InvestmentForm
          initial={editingInvestment ? {
            name: editingInvestment.name,
            amount: editingInvestment.amount,
            frequency: editingInvestment.frequency,
            start_date: editingInvestment.start_date,
            end_date: editingInvestment.end_date,
            note: editingInvestment.note,
          } : undefined}
          onSubmit={async (data) => {
            if (editingInvestment) await useStore.getState().updateInvestment(editingInvestment.id, data);
            else await useStore.getState().addInvestment(data);
            await loadDashboard();
            closeInvestment();
          }}
        />
      </Modal>

      <Modal open={showAddBill || !!editingBill} onClose={closeBill} title={editingBill ? '编辑固定账单' : '新增固定账单'}>
        <BillForm
          initial={editingBill ? {
            name: editingBill.name,
            amount: editingBill.amount,
            due_day: editingBill.due_day,
            note: editingBill.note,
          } : undefined}
          onSubmit={async (data) => {
            if (editingBill) await useStore.getState().updateBill(editingBill.id, data);
            else await useStore.getState().addBill(data);
            await loadDashboard();
            closeBill();
          }}
        />
      </Modal>

      <Modal open={showAddIncome || !!editingIncome} onClose={closeIncome} title={editingIncome ? '编辑固定收入' : '新增固定收入'}>
        <IncomeForm
          initial={editingIncome ? {
            name: editingIncome.name,
            amount: editingIncome.amount,
            frequency: editingIncome.frequency,
            pay_day: editingIncome.pay_day,
            day_of_week: editingIncome.day_of_week,
            start_date: editingIncome.start_date,
            end_date: editingIncome.end_date,
            note: editingIncome.note,
          } : undefined}
          onSubmit={async (data) => {
            if (editingIncome) await useStore.getState().updateIncome(editingIncome.id, data);
            else await useStore.getState().addIncome(data);
            await loadDashboard();
            closeIncome();
          }}
        />
      </Modal>

      <Modal open={showAddSubscription || !!editingSubscription} onClose={closeSubscription} title={editingSubscription ? '编辑订阅' : '新增订阅'}>
        <SubscriptionForm
          initial={editingSubscription ? {
            name: editingSubscription.name,
            amount: editingSubscription.amount,
            billing_day: editingSubscription.billing_day,
            billing_cycle: editingSubscription.billing_cycle,
            category: editingSubscription.category,
            note: editingSubscription.note,
          } : undefined}
          onSubmit={async (data) => {
            if (editingSubscription) await useStore.getState().updateSubscription(editingSubscription.id, data);
            else await useStore.getState().addSubscription(data);
            await loadDashboard();
            closeSubscription();
          }}
        />
      </Modal>
    </div>
  );
}

// ============================================================
// 内部子组件
// ============================================================

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
  divider,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  warning?: boolean;
  success?: boolean;
  highlight?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  collapsible?: boolean;
  expanded?: boolean;
  divider?: boolean;
}) {
  const Comp = divider ? 'div' : 'div';
  const cursorClass = onClick ? 'cursor-pointer hover:bg-notion-bg-alt/50' : '';

  return (
    <Comp
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
    </Comp>
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
  children: React.ReactNode;
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
        <span className={inCurrentCycle ? 'text-notion-text' : 'text-notion-text-muted'}>
          {name}
        </span>
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