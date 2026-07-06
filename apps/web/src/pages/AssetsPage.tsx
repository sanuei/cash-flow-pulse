import { useState } from 'react';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { SearchBar } from '../components/SearchBar';
import { ManagedListCard } from '../components/ManagedListCard';
import { EntityRow } from '../components/EntityRow';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { CashForm } from '../components/CashForm';
import { PageTitle } from '../components/PageTitle';
import { formatYen } from '@cfp/shared';
import type { CashSource } from '@cfp/shared';

export function AssetsPage() {
  const cashSourcesAll = useStore((s) => s.cashSources);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteCash = useStore((s) => s.deleteCash);
  const pendingDeletes = useToast((s) => s.pendingDeletes);
  const softDelete = useToast((s) => s.softDelete);
  const [query, setQuery] = useState('');

  const match = (name: string) => !query || name.toLowerCase().includes(query.toLowerCase());
  const cashSources = cashSourcesAll
    .filter((cs) => !pendingDeletes.includes(cs.id))
    .filter((cs) => match(cs.name));

  const netAvailable = cashSourcesAll
    .filter((cs) => !pendingDeletes.includes(cs.id))
    .reduce((s, c) => s + c.balance - c.locked_amount, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle
        icon="cash"
        title="资产"
        subtitle="现金账户余额 · 可动用与锁定"
        total={cashSourcesAll.length > 0 ? { label: '净可用现金', value: formatYen(netAvailable) } : undefined}
      />
      <SearchBar value={query} onChange={setQuery} placeholder="搜索现金账户..." />

      {/* 现金来源（v1.6 从收入页迁至独立「资产」页）*/}
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
          // 合计 = 余额 - 锁定(净可用) + 锁定(总占用)
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
                  {formatYen(cashSources.reduce((s, c) => s + c.balance - c.locked_amount, 0))}
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
