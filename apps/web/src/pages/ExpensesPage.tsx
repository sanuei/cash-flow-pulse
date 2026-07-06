import { useState } from 'react';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { SearchBar } from '../components/SearchBar';
import { ManagedListCard } from '../components/ManagedListCard';
import { EntityRow } from '../components/EntityRow';
import { Money } from '../components/Money';
import { LoadingState } from '../components/States';
import { BillForm } from '../components/BillForm';
import { CardForm } from '../components/CardForm';
import { OneOffForm } from '../components/OneOffForm';
import { PageTitle } from '../components/PageTitle';
import { formatYen } from '@cfp/shared';
import type { RecurringBill, CreditCard, OneOffExpense } from '@cfp/shared';

// YYYY-MM-DD → "7月15日"
function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

export function ExpensesPage() {
  const calc = useStore((s) => s.calc);
  const creditCardsAll = useStore((s) => s.creditCards);
  const billsAll = useStore((s) => s.bills);
  const oneOffsAll = useStore((s) => s.oneOffs);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteBill = useStore((s) => s.deleteBill);
  const deleteCard = useStore((s) => s.deleteCard);
  const deleteOneOff = useStore((s) => s.deleteOneOff);
  const pendingDeletes = useToast((s) => s.pendingDeletes);
  const softDelete = useToast((s) => s.softDelete);
  const [query, setQuery] = useState('');

  if (!calc) return <LoadingState message="加载中..." />;

  // 乐观隐藏 + 搜索过滤
  const match = (name: string) => !query || name.toLowerCase().includes(query.toLowerCase());
  const notPending = <T extends { id: string }>(x: T) => !pendingDeletes.includes(x.id);
  const creditCards = creditCardsAll.filter(notPending).filter((c) => match(c.name));
  const bills = billsAll.filter(notPending).filter((b) => match(b.name));
  const oneOffs = oneOffsAll.filter(notPending).filter((o) => match(o.name));

  // 临时账单:本期内的 id 集合(用于「本期」badge + 计入本期消费总计),权威来源是 calc
  const oneOffCycleIds = new Set(calc.upcoming_expenses.one_offs.map((o) => o.id));
  const oneOffTotal = calc.upcoming_expenses.total_one_off;
  // 展示按日期倒序(新的在前)
  const oneOffRows = [...oneOffs].sort((a, b) => b.date.localeCompare(a.date));

  // 信用卡:活跃卡(本期要还)排前,已扣(本周期内扣款日已过)排中间,非活跃排后
  // v1.4.4:已扣的卡虽然不再算入 net_available,但仍展示(用"已扣"badge 标注,灰色 tone)
  const cardRows = [
    ...calc.active_cards.map((ac) => ({ card: ac.card, status: 'active' as const, days_until_due: ac.days_until_due, amount: ac.amount })),
    ...calc.paid_this_cycle.map((ac) => ({ card: ac.card, status: 'paid' as const, days_until_due: ac.days_until_due, amount: ac.amount })),
    ...calc.inactive_cards.map((c) => ({ card: c, status: 'inactive' as const, days_until_due: -1, amount: c.statement_amount })),
  ].filter((r) => notPending(r.card));
  const cardTotal = cardRows.reduce((s, r) => s + r.amount, 0);

  // 固定账单:同信用卡逻辑,按本周期扣款日是否已过区分"待扣/已扣"(calc.upcoming_expenses.bills 提供)
  // 未扣排前,已扣排后;非本期(cycle_paid undefined,理论上极少见)排最后
  const billStatusMap = new Map(calc.upcoming_expenses.bills.map((b) => [b.id, b]));
  const billRows = bills
    .map((bill) => {
      const status = billStatusMap.get(bill.id);
      return { bill, cyclePaid: status?.cycle_paid, cycleDaysUntil: status?.cycle_days_until };
    })
    .sort((a, b) => Number(a.cyclePaid ?? false) - Number(b.cyclePaid ?? false));
  const billTotal = bills.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle
        icon="bill"
        title="消费"
        subtitle="信用卡、固定账单、订阅"
        total={{ label: '本期消费总计', value: formatYen(cardTotal + billTotal + oneOffTotal) }}
      />
      <SearchBar value={query} onChange={setQuery} placeholder="搜索消费项目..." />

      {/* 信用卡 */}
      <ManagedListCard<CreditCard>
        icon="card"
        label="信用卡"
        count={creditCards.length}
        empty={{
          icon: 'card',
          title: '还没有信用卡',
          description: '添加待还款的信用卡，填写扣款日',
          addLabel: '添加卡片',
        }}
        formTitle={(e) => (e ? '编辑信用卡' : '新增信用卡')}
        renderForm={(editing, close) => (
          <CardForm
            initial={
              editing
                ? {
                    name: editing.name,
                    statement_amount: editing.statement_amount,
                    due_day: editing.due_day,
                    monthly_statements: editing.monthly_statements,
                  }
                : undefined
            }
            onSubmit={async (data) => {
              if (editing) await useStore.getState().updateCard(editing.id, data);
              else await useStore.getState().addCard(data);
              await loadDashboard();
              close();
            }}
            onCancel={close}
          />
        )}
        footer={
          creditCards.length > 0 ? (
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-notion-text-secondary">合计</span>
              <span className="font-numeric font-semibold text-[15px] text-notion-text">{formatYen(cardTotal)}</span>
            </div>
          ) : null
        }
      >
        {(openEdit) =>
          cardRows.map(({ card, status, days_until_due, amount }) => {
            const hasMonthly = card.monthly_statements && Object.keys(card.monthly_statements).length > 0;
            const tone = status === 'paid' ? 'neutral' : 'warning';
            const moneySign = status === 'active' ? 'negative' : 'neutral';
            return (
            <EntityRow
              key={card.id}
              icon="card"
              tone={tone}
              title={
                <>
                  {card.name}{' '}
                  {status === 'active' ? (
                    <span className="badge-warning badge text-[10px] px-1.5 py-0.5">
                      {days_until_due === 0 ? '今天扣款' : `${days_until_due} 天后扣款`}
                    </span>
                  ) : status === 'paid' ? (
                    <span className="badge-success badge text-[10px] px-1.5 py-0.5">
                      {days_until_due === 0 ? '今天已扣' : `${Math.abs(days_until_due)} 天前已扣`}
                    </span>
                  ) : (
                    <span className="badge-muted badge text-[10px] px-1.5 py-0.5">非本期</span>
                  )}
                </>
              }
              subtitle={`每月 ${card.due_day} 号扣款 · 账单 ${formatYen(amount)}${hasMonthly ? ' · 按月账单' : ''}`}
              money={<Money amount={amount} size="md" sign={moneySign} />}
              onEdit={() => openEdit(card)}
              onDelete={() =>
                softDelete({
                  entityId: card.id,
                  message: `已删除「${card.name}」`,
                  perform: async () => {
                    await deleteCard(card.id);
                    await loadDashboard();
                  },
                })
              }
            />
            );
          })
        }
      </ManagedListCard>

      {/* 固定账单 */}
      <ManagedListCard<RecurringBill>
        icon="bill"
        label="固定账单"
        count={bills.length}
        empty={{
          icon: 'bill',
          title: '还没有固定账单',
          description: '添加房租、水电、网费等每月固定支出',
          addLabel: '添加账单',
        }}
        formTitle={(e) => (e ? '编辑固定账单' : '新增固定账单')}
        renderForm={(editing, close) => (
          <BillForm
            initial={
              editing
                ? { name: editing.name, amount: editing.amount, due_day: editing.due_day, note: editing.note }
                : undefined
            }
            onSubmit={async (data) => {
              if (editing) await useStore.getState().updateBill(editing.id, data);
              else await useStore.getState().addBill(data);
              await loadDashboard();
              close();
            }}
            onCancel={close}
          />
        )}
        footer={
          bills.length > 0 ? (
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-notion-text-secondary">合计</span>
              <span className="font-numeric font-semibold text-[15px] text-notion-text">{formatYen(billTotal)}</span>
            </div>
          ) : null
        }
      >
        {(openEdit) =>
          billRows.map(({ bill: b, cyclePaid, cycleDaysUntil }) => (
            <EntityRow
              key={b.id}
              icon="bill"
              tone={cyclePaid ? 'neutral' : 'warning'}
              title={
                <>
                  {b.name}{' '}
                  {cyclePaid === true ? (
                    <span className="badge-success badge text-[10px] px-1.5 py-0.5">
                      {cycleDaysUntil === 0 ? '今天已扣' : `${cycleDaysUntil} 天前已扣`}
                    </span>
                  ) : cyclePaid === false ? (
                    <span className="badge-warning badge text-[10px] px-1.5 py-0.5">
                      {cycleDaysUntil === 0 ? '今天扣款' : `${cycleDaysUntil} 天后扣款`}
                    </span>
                  ) : null}
                </>
              }
              subtitle={`每月 ${b.due_day} 号扣款`}
              money={<Money amount={b.amount} size="md" sign={cyclePaid ? 'neutral' : 'negative'} />}
              onEdit={() => openEdit(b)}
              onDelete={() =>
                softDelete({
                  entityId: b.id,
                  message: `已删除「${b.name}」`,
                  perform: async () => {
                    await deleteBill(b.id);
                    await loadDashboard();
                  },
                })
              }
            />
          ))
        }
      </ManagedListCard>

      {/* 临时账单（一次性支出） */}
      <ManagedListCard<OneOffExpense>
        icon="calendar"
        label="临时账单"
        count={oneOffs.length}
        empty={{
          icon: 'calendar',
          title: '还没有临时账单',
          description: '记录这个月的特殊/一次性支出，如维修、聚餐、大件',
          addLabel: '添加临时账单',
        }}
        formTitle={(e) => (e ? '编辑临时账单' : '新增临时账单')}
        renderForm={(editing, close) => (
          <OneOffForm
            initial={
              editing
                ? { name: editing.name, amount: editing.amount, date: editing.date, note: editing.note }
                : undefined
            }
            onSubmit={async (data) => {
              if (editing) await useStore.getState().updateOneOff(editing.id, data);
              else await useStore.getState().addOneOff(data);
              await loadDashboard();
              close();
            }}
            onCancel={close}
          />
        )}
        footer={
          oneOffs.length > 0 ? (
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-notion-text-secondary">本期合计</span>
              <span className="font-numeric font-semibold text-[15px] text-notion-text">{formatYen(oneOffTotal)}</span>
            </div>
          ) : null
        }
      >
        {(openEdit) =>
          oneOffRows.map((o) => {
            const inCycle = oneOffCycleIds.has(o.id);
            return (
              <EntityRow
                key={o.id}
                icon="calendar"
                tone={inCycle ? 'warning' : 'neutral'}
                title={
                  <>
                    {o.name}{' '}
                    {inCycle ? (
                      <span className="badge-warning badge text-[10px] px-1.5 py-0.5">本期</span>
                    ) : (
                      <span className="badge-muted badge text-[10px] px-1.5 py-0.5">其他月份</span>
                    )}
                  </>
                }
                subtitle={`${formatMonthDay(o.date)}${o.note ? ' · ' + o.note : ''}`}
                money={<Money amount={o.amount} size="md" sign={inCycle ? 'negative' : 'neutral'} />}
                onEdit={() => openEdit(o)}
                onDelete={() =>
                  softDelete({
                    entityId: o.id,
                    message: `已删除「${o.name}」`,
                    perform: async () => {
                      await deleteOneOff(o.id);
                      await loadDashboard();
                    },
                  })
                }
              />
            );
          })
        }
      </ManagedListCard>

    </div>
  );
}
