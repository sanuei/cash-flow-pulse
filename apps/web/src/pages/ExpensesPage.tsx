import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { ManagedListCard } from '../components/ManagedListCard';
import { EntityRow } from '../components/EntityRow';
import { Money } from '../components/Money';
import { LoadingState } from '../components/States';
import { BillForm } from '../components/BillForm';
import { SubscriptionForm } from '../components/SubscriptionForm';
import { CardForm } from '../components/CardForm';
import { PageTitle } from '../components/PageTitle';
import { formatYen } from '@cfp/shared';
import type { RecurringBill, Subscription, CreditCard } from '@cfp/shared';

export function ExpensesPage() {
  const calc = useStore((s) => s.calc);
  const creditCardsAll = useStore((s) => s.creditCards);
  const billsAll = useStore((s) => s.bills);
  const subscriptionsAll = useStore((s) => s.subscriptions);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteBill = useStore((s) => s.deleteBill);
  const deleteSubscription = useStore((s) => s.deleteSubscription);
  const deleteCard = useStore((s) => s.deleteCard);
  const pendingDeletes = useToast((s) => s.pendingDeletes);
  const softDelete = useToast((s) => s.softDelete);

  if (!calc) return <LoadingState message="加载中..." />;

  // 乐观隐藏正在删除的项
  const notPending = <T extends { id: string }>(x: T) => !pendingDeletes.includes(x.id);
  const creditCards = creditCardsAll.filter(notPending);
  const bills = billsAll.filter(notPending);
  const subscriptions = subscriptionsAll.filter(notPending);

  // 信用卡：活跃卡（本期要还）排前，非活跃卡排后（与原首页一致）
  const cardRows = [
    ...calc.active_cards.map((ac) => ({ card: ac.card, active: true, days_until_due: ac.days_until_due })),
    ...calc.inactive_cards.map((c) => ({ card: c, active: false, days_until_due: -1 })),
  ].filter((r) => notPending(r.card));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle icon="bill" title="消费" subtitle="信用卡、固定账单、订阅" />

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
                ? { name: editing.name, statement_amount: editing.statement_amount, due_day: editing.due_day }
                : undefined
            }
            onSubmit={async (data) => {
              if (editing) await useStore.getState().updateCard(editing.id, data);
              else await useStore.getState().addCard(data);
              await loadDashboard();
              close();
            }}
          />
        )}
      >
        {(openEdit) =>
          cardRows.map(({ card, active, days_until_due }) => (
            <EntityRow
              key={card.id}
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
              subtitle={`每月 ${card.due_day} 号扣款 · 账单 ${formatYen(card.statement_amount)}`}
              money={<Money amount={card.statement_amount} size="md" sign={active ? 'negative' : 'neutral'} />}
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
          ))
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
          />
        )}
      >
        {(openEdit) =>
          bills.map((b) => (
            <EntityRow
              key={b.id}
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

      {/* 订阅 */}
      <ManagedListCard<Subscription>
        icon="subscription"
        label="订阅"
        count={subscriptions.length}
        empty={{
          icon: 'subscription',
          title: '还没有订阅',
          description: '添加 Netflix、Spotify、iCloud 等自动续费服务',
          addLabel: '添加订阅',
        }}
        formTitle={(e) => (e ? '编辑订阅' : '新增订阅')}
        renderForm={(editing, close) => (
          <SubscriptionForm
            initial={
              editing
                ? {
                    name: editing.name,
                    amount: editing.amount,
                    billing_day: editing.billing_day,
                    billing_cycle: editing.billing_cycle,
                    category: editing.category,
                    note: editing.note,
                  }
                : undefined
            }
            onSubmit={async (data) => {
              if (editing) await useStore.getState().updateSubscription(editing.id, data);
              else await useStore.getState().addSubscription(data);
              await loadDashboard();
              close();
            }}
          />
        )}
      >
        {(openEdit) =>
          subscriptions.map((s) => (
            <EntityRow
              key={s.id}
              title={
                <>
                  {s.name}{' '}
                  <span className="badge-warning badge text-[10px] px-1.5 py-0.5">
                    {s.billing_cycle === 'monthly' ? '月' : '年'}
                  </span>
                </>
              }
              subtitle={`${s.billing_cycle === 'monthly' ? '每月' : '每年'} ${s.billing_day} 号扣款`}
              money={<Money amount={s.amount} size="md" sign="negative" />}
              onEdit={() => openEdit(s)}
              onDelete={() =>
                softDelete({
                  entityId: s.id,
                  message: `已删除「${s.name}」`,
                  perform: async () => {
                    await deleteSubscription(s.id);
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
