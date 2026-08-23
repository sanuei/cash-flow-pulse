import { useMemo, useState } from 'react';
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
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { formatYen } from '@cfp/shared';
import { Link } from 'react-router-dom';
import type { RecurringIncome } from '@cfp/shared';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// YYYY-MM-DD → "7月15日"
function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

// 临时收入行：本期 badge 可选(往期不带),展开/折叠区共用同一行视觉
function OneOffIncomeRow({
  inc,
  inCycle,
  onEdit,
  onDelete,
}: {
  inc: RecurringIncome;
  inCycle?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <EntityRow
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
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
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
  const allOneOffs = visible
    .filter((i) => i.frequency === 'single')
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  // 本期到账的收入 id(用于「本期」badge)——权威来源是 calc
  const cycleIncomeIds = new Set((calc?.upcoming_incomes.items ?? []).map((it) => it.id));

  // 临时收入按"是否在本期/未来"二分:本期/未来月平铺，往期按月折叠
  // 「本期」=发薪周期内(来自 calc.upcoming_incomes)。其他 single 收入按 start_date
  // 落在当前自然月及之后视为"未来"，更早的为"往期"。
  const today = new Date();
  const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const oneOffCurrentAndFuture = allOneOffs.filter((i) => {
    if (cycleIncomeIds.has(i.id)) return true;             // 本期(发薪周期内)
    const ym = i.start_date.slice(0, 7);
    return ym >= currentYM;                                  // 当前月及之后
  });
  const oneOffsPast = allOneOffs.filter((i) => {
    if (cycleIncomeIds.has(i.id)) return false;             // 本期已算到上方
    return i.start_date.slice(0, 7) < currentYM;            // 早于当前月
  });
  // 往期按 YYYY-MM 分组，按月份倒序(最近的往期月排在最前)
  const pastByMonth = useMemo(() => {
    const map = new Map<string, { ym: string; label: string; items: RecurringIncome[]; total: number }>();
    for (const inc of oneOffsPast) {
      const ym = inc.start_date.slice(0, 7);
      const existing = map.get(ym);
      if (existing) {
        existing.items.push(inc);
        existing.total += inc.amount;
      } else {
        const [y, m] = ym.split('-');
        map.set(ym, { ym, label: `${Number(y)}年${Number(m)}月`, items: [inc], total: inc.amount });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.ym.localeCompare(a.ym));
  }, [oneOffsPast]);
  const [pastOpen, setPastOpen] = useState(false);
  // 顶部 ManagedListCard 自带编辑 Modal,但折叠区不在它里面,需要独立的 state
  const [editingPast, setEditingPast] = useState<RecurringIncome | null>(null);
  const openEditPast = (inc: RecurringIncome) => setEditingPast(inc);

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

      {/* 临时收入（一次性到账，如年终奖/报销/卖二手）
          本期/未来月份平铺在主卡，往期月份折叠在下方（按月聚合） */}
      <ManagedListCard<RecurringIncome>
        icon="income"
        label="临时收入"
        count={allOneOffs.length}
        empty={{
          icon: 'income',
          title:
            allOneOffs.length > 0
              ? '本期与未来月份都没有临时收入'
              : '还没有临时收入',
          description:
            allOneOffs.length > 0
              ? `往期 ${oneOffsPast.length} 笔已折叠在下方`
              : '记录一次性到账，如年终奖、报销、卖二手',
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
          oneOffCurrentAndFuture.map((inc) => (
            <OneOffIncomeRow
              key={inc.id}
              inc={inc}
              inCycle={cycleIncomeIds.has(inc.id)}
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
          ))
        }
      </ManagedListCard>

      {/* 往期月份折叠区：按月聚合，仅在确实存在往期时显示 */}
      {pastByMonth.length > 0 && (
        <Card
          divided={false}
          className="!p-0 overflow-hidden"
          title={null}
          action={null}
        >
          <button
            type="button"
            onClick={() => setPastOpen((v) => !v)}
            className="
              group flex items-center justify-between gap-3 w-full text-left
              px-5 py-4
              transition-colors duration-[var(--dur-base)]
              hover:bg-[var(--c-bg-alt)]
            "
            aria-expanded={pastOpen}
          >
            <span className="flex items-center gap-2.5 min-w-0 flex-1">
              <Icon
                name={pastOpen ? 'chevron-down' : 'chevron-right'}
                size={14}
                className="text-notion-text-muted transition-transform duration-[var(--dur-fast)] shrink-0"
              />
              <span className="text-[14px] font-semibold text-notion-text whitespace-nowrap shrink-0">
                往期临时收入
              </span>
              <span className="badge badge-muted text-[11px] px-2 py-0.5 whitespace-nowrap shrink-0">
                {oneOffsPast.length} 笔
              </span>
              <span className="text-[11px] text-notion-text-muted whitespace-nowrap shrink-0">
                · {pastByMonth.length} 个月
              </span>
            </span>
            <span className="text-[12px] tabular-nums font-semibold text-notion-text-secondary whitespace-nowrap shrink-0">
              {formatYen(oneOffsPast.reduce((s, i) => s + i.amount, 0))}
            </span>
          </button>
          {pastOpen && (
            <div className="px-5 pb-5 space-y-3">
              {pastByMonth.map((group) => (
                <div key={group.ym}>
                  <div className="flex items-center justify-between px-1 py-1.5">
                    <span className="text-[12px] font-medium text-notion-text-secondary whitespace-nowrap">
                      {group.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-notion-text-muted whitespace-nowrap">
                      {formatYen(group.total)} · {group.items.length} 笔
                    </span>
                  </div>
                  <ul className="stagger divide-y divide-[var(--c-border)] -mx-5 overflow-hidden rounded-[var(--radius-md)]">
                    {group.items.map((inc) => (
                      <OneOffIncomeRow
                        key={inc.id}
                        inc={inc}
                        onEdit={() => openEditPast(inc)}
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
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 共享编辑 Modal:顶部 ManagedListCard 的新增 + 往期折叠区行点击编辑都走这里 */}
      <Modal
        open={editingPast !== null}
        onClose={() => setEditingPast(null)}
        title={editingPast ? '编辑临时收入' : ''}
        icon="income"
      >
        {editingPast && (
          <OneOffForm
            amountLabel="收入金额"
            tone="success"
            namePlaceholder="如 年终奖 / 报销 / 卖二手"
            initial={{
              name: editingPast.name,
              amount: editingPast.amount,
              date: editingPast.start_date,
              note: editingPast.note,
            }}
            onSubmit={async (data) => {
              await useStore.getState().updateIncome(editingPast.id, {
                name: data.name,
                amount: data.amount,
                frequency: 'single',
                pay_day: null,
                day_of_week: null,
                start_date: data.date,
                end_date: data.date,
                note: data.note,
              });
              await loadDashboard();
              setEditingPast(null);
            }}
            onCancel={() => setEditingPast(null)}
          />
        )}
      </Modal>

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
