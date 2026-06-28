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
import { PageTitle } from '../components/PageTitle';
import { formatYen } from '@cfp/shared';
import type { RecurringBill, CreditCard } from '@cfp/shared';

export function ExpensesPage() {
  const calc = useStore((s) => s.calc);
  const creditCardsAll = useStore((s) => s.creditCards);
  const billsAll = useStore((s) => s.bills);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteBill = useStore((s) => s.deleteBill);
  const deleteCard = useStore((s) => s.deleteCard);
  const pendingDeletes = useToast((s) => s.pendingDeletes);
  const softDelete = useToast((s) => s.softDelete);
  const [query, setQuery] = useState('');

  if (!calc) return <LoadingState message="加载中..." />;

  // 乐观隐藏 + 搜索过滤
  const match = (name: string) => !query || name.toLowerCase().includes(query.toLowerCase());
  const notPending = <T extends { id: string }>(x: T) => !pendingDeletes.includes(x.id);
  const creditCards = creditCardsAll.filter(notPending).filter((c) => match(c.name));
  const bills = billsAll.filter(notPending).filter((b) => match(b.name));

  // 信用卡：活跃卡（本期要还）排前，非活跃卡排后（与原首页一致）
  const cardRows = [
    ...calc.active_cards.map((ac) => ({ card: ac.card, active: true, days_until_due: ac.days_until_due, amount: ac.amount })),
    ...calc.inactive_cards.map((c) => ({ card: c, active: false, days_until_due: -1, amount: c.statement_amount })),
  ].filter((r) => notPending(r.card));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle icon="bill" title="消费" subtitle="信用卡、固定账单、订阅" />
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
      >
        {(openEdit) =>
          cardRows.map(({ card, active, days_until_due, amount }) => {
            const hasMonthly = card.monthly_statements && Object.keys(card.monthly_statements).length > 0;
            return (
            <EntityRow
              key={card.id}
              icon="card"
              tone="warning"
              title={
                <>
                  {card.name}{' '}
                  {active ? (
                    <span className="badge-warning badge text-[10px] px-1.5 py-0.5">
                      {days_until_due === 0 ? '今天扣款' : `${days_until_due} 天后扣款`}
                    </span>
                  ) : (
                    <span className="badge-muted badge text-[10px] px-1.5 py-0.5">非本期</span>
                  )}
                </>
              }
              subtitle={`每月 ${card.due_day} 号扣款 · 账单 ${formatYen(amount)}${hasMonthly ? ' · 按月账单' : ''}`}
              money={<Money amount={amount} size="md" sign={active ? 'negative' : 'neutral'} />}
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
      >
        {(openEdit) =>
          bills.map((b) => (
            <EntityRow
              key={b.id}
              icon="bill"
              tone="warning"
              title={b.name}
              subtitle={`每月 ${b.due_day} 号扣款`}
              money={<Money amount={b.amount} size="md" sign="negative" />}
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

    </div>
  );
}
