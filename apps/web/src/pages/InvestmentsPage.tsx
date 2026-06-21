import { useStore } from '../lib/store';
import { ManagedListCard } from '../components/ManagedListCard';
import { EntityRow } from '../components/EntityRow';
import { Money } from '../components/Money';
import { InvestmentForm } from '../components/InvestmentForm';
import { PageTitle } from '../components/PageTitle';
import { formatYen } from '@cfp/shared';
import type { RecurringInvestment, InvestmentFrequency } from '@cfp/shared';

const FREQ_LABEL: Record<InvestmentFrequency, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

export function InvestmentsPage() {
  const investments = useStore((s) => s.investments);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteInvestment = useStore((s) => s.deleteInvestment);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle icon="investment" title="投资" subtitle="基金定投、黄金积存等自动扣款" />

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
          />
        )}
      >
        {(openEdit) =>
          investments.map((inv) => (
            <EntityRow
              key={inv.id}
              title={inv.name}
              subtitle={`${FREQ_LABEL[inv.frequency]}扣款 ${formatYen(inv.amount)} · 始于 ${inv.start_date}`}
              money={<Money amount={inv.amount} size="md" sign="negative" />}
              onEdit={() => openEdit(inv)}
              onDelete={async () => {
                if (confirm(`删除「${inv.name}」？`)) {
                  await deleteInvestment(inv.id);
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
