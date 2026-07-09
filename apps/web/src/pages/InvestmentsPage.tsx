import { useState } from 'react';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { SearchBar } from '../components/SearchBar';
import { ManagedListCard } from '../components/ManagedListCard';
import { EntityRow } from '../components/EntityRow';
import { Money } from '../components/Money';
import { InvestmentForm } from '../components/InvestmentForm';
import { OneOffForm } from '../components/OneOffForm';
import { PageTitle } from '../components/PageTitle';
import { formatYen } from '@cfp/shared';
import type { RecurringInvestment, InvestmentFrequency } from '@cfp/shared';

const FREQ_LABEL: Record<InvestmentFrequency, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
  single: '临时',
};

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// YYYY-MM-DD → "7月15日"
function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

// 频率 + 具体扣款日：「每月15号」「每周一」，daily/yearly 保持原样
function freqDesc(inv: RecurringInvestment): string {
  if (inv.frequency === 'monthly' && inv.pay_day != null) return `每月 ${inv.pay_day} 号`;
  if (inv.frequency === 'weekly' && inv.day_of_week != null) return WEEKDAYS[inv.day_of_week] ?? '每周';
  return FREQ_LABEL[inv.frequency];
}

export function InvestmentsPage() {
  const calc = useStore((s) => s.calc);
  const investmentsAll = useStore((s) => s.investments);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteInvestment = useStore((s) => s.deleteInvestment);
  const pendingDeletes = useToast((s) => s.pendingDeletes);
  const softDelete = useToast((s) => s.softDelete);
  const [query, setQuery] = useState('');
  const visible = investmentsAll
    .filter((i) => !pendingDeletes.includes(i.id))
    .filter((i) => !query || i.name.toLowerCase().includes(query.toLowerCase()));
  // 固定投资(循环) 与 临时投资(single) 分开
  const investments = visible.filter((i) => i.frequency !== 'single');
  const oneOffs = visible.filter((i) => i.frequency === 'single').sort((a, b) => b.start_date.localeCompare(a.start_date));
  // 本期发生的投资 id（用于「本期」badge）
  const cycleInvestIds = new Set((calc?.upcoming_expenses.investments ?? []).map((it) => it.id));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle
        icon="investment"
        title="投资"
        subtitle="基金定投、黄金积存等自动扣款"
        total={calc ? { label: '本期投资总计', value: formatYen(calc.upcoming_expenses.total_investments) } : undefined}
      />
      <SearchBar value={query} onChange={setQuery} placeholder="搜索投资项目..." />

      <ManagedListCard<RecurringInvestment>
        icon="investment"
        label="固定投资"
        count={investments.length}
        empty={{
          icon: 'investment',
          title: '还没有固定投资',
          description: '添加基金定投、黄金积存等自动扣款项目',
          addLabel: '添加投资',
        }}
        formTitle={(e) => (e ? '编辑固定投资' : '新增固定投资')}
        renderForm={(editing, close) => (
          <InvestmentForm
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
              if (editing) await useStore.getState().updateInvestment(editing.id, data);
              else await useStore.getState().addInvestment(data);
              await loadDashboard();
              close();
            }}
            onCancel={close}
          />
        )}
      >
        {(openEdit) =>
          investments.map((inv) => (
            <EntityRow
              key={inv.id}
              icon="investment"
              tone="accent"
              title={inv.name}
              subtitle={`${freqDesc(inv)}扣款 ${formatYen(inv.amount)} · 始于 ${inv.start_date}`}
              money={<Money amount={inv.amount} size="md" sign="negative" />}
              onEdit={() => openEdit(inv)}
              onDelete={() =>
                softDelete({
                  entityId: inv.id,
                  message: `已删除「${inv.name}」`,
                  perform: async () => {
                    await deleteInvestment(inv.id);
                    await loadDashboard();
                  },
                })
              }
            />
          ))
        }
      </ManagedListCard>

      {/* 临时投资（一次性买入，如补仓、打新、大额申购）*/}
      <ManagedListCard<RecurringInvestment>
        icon="investment"
        label="临时投资"
        count={oneOffs.length}
        empty={{
          icon: 'investment',
          title: '还没有临时投资',
          description: '记录一次性买入，如补仓、打新、大额申购',
          addLabel: '添加临时投资',
        }}
        formTitle={(e) => (e ? '编辑临时投资' : '新增临时投资')}
        renderForm={(editing, close) => (
          <OneOffForm
            amountLabel="投资金额"
            tone="accent"
            namePlaceholder="如 补仓 / 打新 / 大额申购"
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
                end_date: null,
                note: data.note,
              };
              if (editing) await useStore.getState().updateInvestment(editing.id, payload);
              else await useStore.getState().addInvestment(payload);
              await loadDashboard();
              close();
            }}
            onCancel={close}
          />
        )}
      >
        {(openEdit) =>
          oneOffs.map((inv) => {
            const inCycle = cycleInvestIds.has(inv.id);
            return (
              <EntityRow
                key={inv.id}
                icon="investment"
                tone="accent"
                title={
                  <>
                    {inv.name}{' '}
                    {inCycle && <span className="badge-success badge text-[10px] px-1.5 py-0.5">本期</span>}
                  </>
                }
                subtitle={`${formatMonthDay(inv.start_date)}${inv.note ? ' · ' + inv.note : ''}`}
                money={<Money amount={inv.amount} size="md" sign="negative" />}
                onEdit={() => openEdit(inv)}
                onDelete={() =>
                  softDelete({
                    entityId: inv.id,
                    message: `已删除「${inv.name}」`,
                    perform: async () => {
                      await deleteInvestment(inv.id);
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
