import { useState } from 'react';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { SearchBar } from '../components/SearchBar';
import { ManagedListCard } from '../components/ManagedListCard';
import { EntityRow } from '../components/EntityRow';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { IncomeForm } from '../components/IncomeForm';
import { CashForm } from '../components/CashForm';
import { PageTitle } from '../components/PageTitle';
import { formatYen } from '@cfp/shared';
import type { RecurringIncome, CashSource } from '@cfp/shared';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function IncomesPage() {
  const calc = useStore((s) => s.calc);
  const incomesAll = useStore((s) => s.incomes);
  const cashSourcesAll = useStore((s) => s.cashSources);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteIncome = useStore((s) => s.deleteIncome);
  const deleteCash = useStore((s) => s.deleteCash);
  const pendingDeletes = useToast((s) => s.pendingDeletes);
  const softDelete = useToast((s) => s.softDelete);
  const [query, setQuery] = useState('');

  const match = (name: string) => !query || name.toLowerCase().includes(query.toLowerCase());
  const incomes = incomesAll
    .filter((i) => !pendingDeletes.includes(i.id))
    .filter((i) => match(i.name));
  const cashSources = cashSourcesAll
    .filter((cs) => !pendingDeletes.includes(cs.id))
    .filter((cs) => match(cs.name));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle
        icon="income"
        title="收入"
        subtitle="固定到账收入 · 现金账户余额"
        total={calc ? { label: '本期收入总计', value: formatYen(calc.upcoming_incomes.total) } : undefined}
      />
      <SearchBar value={query} onChange={setQuery} placeholder="搜索收入 / 现金账户..." />

      {/* 固定收入 */}
      <ManagedListCard<RecurringIncome>
        icon="income"
        label="固定收入"
        count={incomes.length}
        empty={{
          icon: 'income',
          title: '还没有固定收入',
          description: '添加工资、副业等自动到账项目',
          addLabel: '添加收入',
        }}
        formTitle={(e) => (e ? '编辑固定收入' : '新增固定收入')}
        renderForm={(editing, close) => (
          <IncomeForm
            initial={
              editing
                ? {
                    name: editing.name,
                    amount: editing.amount,
                    frequency: editing.frequency,
                    pay_day: editing.pay_day,
                    day_of_week: editing.day_of_week,
                    start_date: editing.start_date,
                    end_date: editing.end_date,
                    note: editing.note,
                  }
                : undefined
            }
            onSubmit={async (data) => {
              if (editing) await useStore.getState().updateIncome(editing.id, data);
              else await useStore.getState().addIncome(data);
              await loadDashboard();
              close();
            }}
            onCancel={close}
          />
        )}
      >
        {(openEdit) =>
          incomes.map((inc) => {
            const freqLabel =
              inc.frequency === 'monthly'
                ? `每月 ${inc.pay_day} 号`
                : inc.frequency === 'weekly'
                ? `每${WEEKDAYS[inc.day_of_week ?? 0]}`
                : `单次 ${inc.start_date}`;  // single 模式
            return (
              <EntityRow
                key={inc.id}
                icon="income"
                tone="success"
                title={inc.name}
                subtitle={freqLabel}
                money={<Money amount={inc.amount} size="md" sign="positive" />}
                onEdit={() => openEdit(inc)}
                onDelete={() =>
                  softDelete({
                    entityId: inc.id,
                    message: `已删除「${inc.name}」`,
                    perform: async () => {
                      await deleteIncome(inc.id);
                      await loadDashboard();
                    },
                  })
                }
              />
            );
          })
        }
      </ManagedListCard>

      {/* 现金来源（从总览迁移至此：收入 = 现金余额 + 本期到账） */}
      <ManagedListCard<CashSource>
        icon="cash"
        label="现金来源"
        count={cashSources.length}
        empty={{
          icon: 'cash',
          title: '还没有现金来源',
          description: '添加 PayPay、钱包现金、银行活期等',
          addLabel: '添加现金账户',
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
            onCancel={close}
          />
        )}
        footer={
          // v1.4.6:合计 = 余额 - 锁定(净可用) + 锁定(总占用)
          //   用户能一眼看到"我总共有多少钱 / 锁定的 / 净可用"
          cashSources.length > 0 ? (
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <div className="flex items-center gap-2 text-notion-text-secondary">
                <Icon name="cash" size={14} strokeWidth={1.75} className="text-notion-text-muted" />
                <span className="font-semibold">合计</span>
                <span className="text-notion-text-muted">·</span>
                <span className="text-notion-text-muted">
                  总余额{' '}
                  <span className="font-numeric font-semibold text-notion-text">
                    {formatYen(cashSources.reduce((s, c) => s + c.balance, 0))}
                  </span>
                </span>
                {cashSources.some((c) => c.locked_amount > 0) && (
                  <>
                    <span className="text-notion-text-muted">·</span>
                    <span className="inline-flex items-center gap-0.5 text-notion-text-muted">
                      <Icon name="lock" size={10} />
                      锁定{' '}
                      <span className="font-numeric">
                        {formatYen(cashSources.reduce((s, c) => s + c.locked_amount, 0))}
                      </span>
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] uppercase tracking-caps text-notion-text-muted font-semibold">
                  净可用
                </span>
                <span className="font-display font-semibold text-[18px] font-numeric text-notion-text">
                  {formatYen(
                    cashSources.reduce((s, c) => s + c.balance - c.locked_amount, 0)
                  )}
                </span>
              </div>
            </div>
          ) : null
        }
      >
        {(openEdit) =>
          cashSources.map((cs) => (
            <EntityRow
              key={cs.id}
              icon="cash"
              tone="neutral"
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
              onDelete={() =>
                softDelete({
                  entityId: cs.id,
                  message: `已删除「${cs.name}」`,
                  perform: async () => {
                    await deleteCash(cs.id);
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
