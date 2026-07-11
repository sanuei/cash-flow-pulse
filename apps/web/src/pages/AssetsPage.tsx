import { useState } from 'react';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { SearchBar } from '../components/SearchBar';
import { ManagedListCard } from '../components/ManagedListCard';
import { EntityRow } from '../components/EntityRow';
import { Money } from '../components/Money';
import { Icon, type IconName } from '../components/Icon';
import { CashForm } from '../components/CashForm';
import { OtherAssetForm } from '../components/OtherAssetForm';
import { PageTitle } from '../components/PageTitle';
import { formatYen } from '@cfp/shared';
import type { CashSource, OtherAsset, AssetCategory } from '@cfp/shared';

const CATEGORY_ICON: Record<AssetCategory, IconName> = {
  stock: 'stock',
  crypto: 'crypto',
  real_estate: 'realestate',
  other: 'asset-other',
};
const CATEGORY_LABEL: Record<AssetCategory, string> = {
  stock: '股票/基金',
  crypto: '加密货币',
  real_estate: '房产',
  other: '其他',
};

export function AssetsPage() {
  const cashSourcesAll = useStore((s) => s.cashSources);
  const otherAssetsAll = useStore((s) => s.otherAssets);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteCash = useStore((s) => s.deleteCash);
  const deleteOtherAsset = useStore((s) => s.deleteOtherAsset);
  const pendingDeletes = useToast((s) => s.pendingDeletes);
  const softDelete = useToast((s) => s.softDelete);
  const [query, setQuery] = useState('');

  const match = (name: string) => !query || name.toLowerCase().includes(query.toLowerCase());
  const cashSources = cashSourcesAll
    .filter((cs) => !pendingDeletes.includes(cs.id))
    .filter((cs) => match(cs.name));
  const otherAssets = otherAssetsAll
    .filter((a) => !pendingDeletes.includes(a.id))
    .filter((a) => match(a.name));

  const netAvailable = cashSourcesAll
    .filter((cs) => !pendingDeletes.includes(cs.id))
    .reduce((s, c) => s + c.balance - c.locked_amount, 0);
  const otherAssetsTotal = otherAssetsAll
    .filter((a) => !pendingDeletes.includes(a.id))
    .reduce((s, a) => s + a.value, 0);
  const netWorth = netAvailable + otherAssetsTotal;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle
        icon="cash"
        title="资产"
        subtitle="现金账户 · 股票基金 · 加密货币 · 房产等"
        total={
          cashSourcesAll.length > 0 || otherAssetsAll.length > 0
            ? { label: '总资产', value: formatYen(netWorth) }
            : undefined
        }
      />
      <SearchBar value={query} onChange={setQuery} placeholder="搜索资产..." />

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

      {/* 其他资产（股票/基金、加密货币、房产等，手动估值，不参与日均预算计算）*/}
      <ManagedListCard<OtherAsset>
        icon="stock"
        label="其他资产"
        count={otherAssets.length}
        empty={{
          icon: 'stock',
          title: '还没有其他资产',
          description: '添加股票基金、加密货币、房产等资产，手动记录当前价值',
          addLabel: '添加资产',
        }}
        formTitle={(e) => (e ? '编辑资产' : '新增资产')}
        renderForm={(editing, close) => (
          <OtherAssetForm
            initial={
              editing
                ? { name: editing.name, category: editing.category, value: editing.value, note: editing.note }
                : undefined
            }
            onSubmit={async (data) => {
              if (editing) await useStore.getState().updateOtherAsset(editing.id, data);
              else await useStore.getState().addOtherAsset(data);
              await loadDashboard();
              close();
            }}
            onCancel={close}
          />
        )}
        footer={
          otherAssets.length > 0 ? (
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-notion-text-secondary">合计</span>
              <span className="font-numeric font-semibold text-[15px] text-notion-text">
                {formatYen(otherAssets.reduce((s, a) => s + a.value, 0))}
              </span>
            </div>
          ) : null
        }
      >
        {(openEdit) =>
          otherAssets.map((a) => (
            <EntityRow
              key={a.id}
              icon={CATEGORY_ICON[a.category]}
              tone="accent"
              title={a.name}
              subtitle={`${CATEGORY_LABEL[a.category]}${a.note ? ' · ' + a.note : ''}`}
              money={<Money amount={a.value} size="md" sign="neutral" />}
              onEdit={() => openEdit(a)}
              onDelete={() =>
                softDelete({
                  entityId: a.id,
                  message: `已删除「${a.name}」`,
                  perform: async () => {
                    await deleteOtherAsset(a.id);
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
