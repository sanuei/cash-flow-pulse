import { useState } from 'react';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { SearchBar } from '../components/SearchBar';
import { ManagedListCard } from '../components/ManagedListCard';
import { EntityRow } from '../components/EntityRow';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { IncomeForm } from '../components/IncomeForm';
import { OneOffForm } from '../components/OneOffForm';
import { PageTitle } from '../components/PageTitle';
import { formatYen } from '@cfp/shared';
import { Link } from 'react-router-dom';
import type { RecurringIncome } from '@cfp/shared';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// YYYY-MM-DD → "7月15日"
function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

export function IncomesPage() {
  const calc = useStore((s) => s.calc);
  const incomesAll = useStore((s) => s.incomes);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteIncome = useStore((s) => s.deleteIncome);
  const pendingDeletes = useToast((s) => s.pendingDeletes);
  const softDelete = useToast((s) => s.softDelete);
  const [query, setQuery] = useState('');

  const match = (name: string) => !query || name.toLowerCase().includes(query.toLowerCase());
  const visible = incomesAll
    .filter((i) => !pendingDeletes.includes(i.id))
    .filter((i) => match(i.name));
  // 固定收入(每月/每周) 与 临时收入(single) 分开
  const incomes = visible.filter((i) => i.frequency !== 'single');
  const oneOffs = visible.filter((i) => i.frequency === 'single').sort((a, b) => b.start_date.localeCompare(a.start_date));
  // 本期到账的收入 id(用于「本期」badge)——权威来源是 calc
  const cycleIncomeIds = new Set((calc?.upcoming_incomes.items ?? []).map((it) => it.id));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle
        icon="income"
        title="收入"
        subtitle="固定到账收入（工资、副业等）"
        total={calc ? { label: '本期收入总计', value: formatYen(calc.upcoming_incomes.total) } : undefined}
      />
      <SearchBar value={query} onChange={setQuery} placeholder="搜索收入..." />

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

      {/* 临时收入（一次性到账，如年终奖/报销/卖二手）*/}
      <ManagedListCard<RecurringIncome>
        icon="income"
        label="临时收入"
        count={oneOffs.length}
        empty={{
          icon: 'income',
          title: '还没有临时收入',
          description: '记录一次性到账，如年终奖、报销、卖二手',
          addLabel: '添加临时收入',
        }}
        formTitle={(e) => (e ? '编辑临时收入' : '新增临时收入')}
        renderForm={(editing, close) => (
          <OneOffForm
            amountLabel="收入金额"
            tone="success"
            namePlaceholder="如 年终奖 / 报销 / 卖二手"
            initial={
              editing
                ? { name: editing.name, amount: editing.amount, date: editing.start_date, note: editing.note }
                : undefined
            }
            onSubmit={async (data) => {
              const payload = {
                name: data.name,
                amount: data.amount,
                frequency: 'single' as const,
                pay_day: null,
                day_of_week: null,
                start_date: data.date,
                end_date: data.date,
                note: data.note,
              };
              if (editing) await useStore.getState().updateIncome(editing.id, payload);
              else await useStore.getState().addIncome(payload);
              await loadDashboard();
              close();
            }}
            onCancel={close}
          />
        )}
      >
        {(openEdit) =>
          oneOffs.map((inc) => {
            const inCycle = cycleIncomeIds.has(inc.id);
            return (
              <EntityRow
                key={inc.id}
                icon="income"
                tone="success"
                title={
                  <>
                    {inc.name}{' '}
                    {inCycle && <span className="badge-success badge text-[10px] px-1.5 py-0.5">本期</span>}
                  </>
                }
                subtitle={`${formatMonthDay(inc.start_date)}${inc.note ? ' · ' + inc.note : ''}`}
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

      {/* 现金账户已迁至独立「资产」页；此处保留入口（移动端无侧栏，靠它进入） */}
      <Link
        to="/assets"
        className="card p-4 flex items-center justify-between gap-3 hover:-translate-y-0.5 transition-transform"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-shrink-0 w-9 h-9 rounded-[var(--radius-md)] bg-[var(--c-bg-alt)] flex items-center justify-center">
            <Icon name="cash" size={16} className="text-notion-text-secondary" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-notion-text">现金账户 · 资产</div>
            <div className="text-[11px] text-notion-text-muted">管理 PayPay、钱包、银行活期等余额</div>
          </div>
        </div>
        <Icon name="chevron-right" size={16} className="text-notion-text-muted flex-shrink-0" />
      </Link>
    </div>
  );
}
