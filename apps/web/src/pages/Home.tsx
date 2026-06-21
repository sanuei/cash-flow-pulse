import { useState } from 'react';
import { useStore } from '../lib/store';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { Money } from '../components/Money';
import { EmptyState, LoadingState } from '../components/States';
import { CashForm } from '../components/CashForm';
import { CardForm } from '../components/CardForm';
import { Icon } from '../components/Icon';
import { formatYen } from '@cfp/shared';
import type { CashSource, CreditCard } from '@cfp/shared';

export function Home() {
  const calc = useStore((s) => s.calc);
  const cashSources = useStore((s) => s.cashSources);
  const creditCards = useStore((s) => s.creditCards);
  const config = useStore((s) => s.config);
  const prompt = useStore((s) => s.prompt);
  const loading = useStore((s) => s.loading);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const deleteCash = useStore((s) => s.deleteCash);
  const deleteCard = useStore((s) => s.deleteCard);
  const recordSnapshot = useStore((s) => s.recordSnapshot);

  const [editingCash, setEditingCash] = useState<CashSource | null>(null);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [showAddCash, setShowAddCash] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);

  if (loading && !calc) return <LoadingState />;
  if (!calc || !config) return <LoadingState message="初始化..." />;

  const onRecordSnapshot = async () => {
    if (!prompt) return;
    setSnapshotSaving(true);
    try {
      await recordSnapshot(prompt.cycle_id, prompt.offset_index);
      await loadDashboard();
    } finally {
      setSnapshotSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      {/* 顶部移动端标题 */}
      <div className="sm:hidden flex items-center gap-2 font-bold text-notion-text">
        <Icon name="wallet" size={18} />
        <span>Cash Flow Pulse</span>
      </div>

      {/* Hero - 日均预算 */}
      <section className="text-center pt-4 pb-6">
        <div className="text-xs uppercase tracking-wider text-notion-text-muted mb-2">
          日均可用预算
        </div>
        <div className="mb-3">
          <Money amount={calc.daily_budget} size="hero" className="tracking-tight-display" />
          <span className="text-2xl sm:text-3xl text-notion-text-secondary font-medium ml-2">/ 日</span>
        </div>
        <div className="text-sm text-notion-text-secondary">
          距离下个发薪日（{calc.next_payday_date}）还有 <b className="text-notion-text font-semibold">{calc.days_to_payday}</b> 天
        </div>
      </section>

      {/* 采集点提示条 */}
      {prompt && (
        <div className="bg-notion-bg-alt border border-notion-border rounded-comfortable px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-white border border-notion-border flex items-center justify-center">
              <Icon name="pin" size={16} className="text-notion-blue" />
            </div>
            <div className="flex-1 text-sm min-w-0">
              <div className="font-semibold text-notion-text">
                今天到了第 {prompt.offset_index + 1} 个采集点
              </div>
              <div className="text-notion-text-secondary text-xs mt-0.5">
                {prompt.exists ? '已录入，可更新' : '点击录入本月快照'}（周期第 {prompt.cycle_day} 天）
              </div>
            </div>
          </div>
          <button
            className="btn-primary text-sm flex-shrink-0"
            disabled={snapshotSaving}
            onClick={onRecordSnapshot}
          >
            {snapshotSaving ? '保存中...' : prompt.exists ? '更新' : '录入'}
          </button>
        </div>
      )}

      {/* 摘要卡片 */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="sparkle" size={18} className="text-notion-blue" strokeWidth={1.75} />
            <span>本期概览</span>
          </div>
        }
      >
        <dl className="divide-y divide-notion-border">
          <Row label="现金来源总额" value={formatYen(calc.total_balance)} />
          <Row
            label="锁定金额"
            value={`-${formatYen(calc.total_locked)}`}
            muted
            icon={<Icon name="lock" size={14} className="text-notion-text-muted" />}
          />
          <Row
            label="本期应还（信用卡）"
            value={`-${formatYen(calc.total_due)}`}
            warning={calc.total_due > 0}
            icon={<Icon name="card" size={14} className="text-notion-warning" />}
          />
          <Row label="净可用现金" value={formatYen(calc.net_available)} bold />
          <Row
            label="日均预算"
            value={`${formatYen(calc.daily_budget)} / 日`}
            bold
            highlight
          />
        </dl>
      </Card>

      {/* 现金来源明细 */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="cash" size={18} className="text-notion-text-secondary" strokeWidth={1.75} />
            <span>现金来源 ({cashSources.length})</span>
          </div>
        }
        action={
          <button
            onClick={() => setShowAddCash(true)}
            className="btn-ghost text-notion-blue flex items-center gap-1"
          >
            <Icon name="add" size={14} strokeWidth={2} />
            <span>新增</span>
          </button>
        }
      >
        {cashSources.length === 0 ? (
          <EmptyState
            icon="cash"
            title="还没有现金来源"
            description="添加 PayPay、钱包现金、银行活期等"
            action={
              <button onClick={() => setShowAddCash(true)} className="btn-primary flex items-center gap-1.5 mx-auto">
                <Icon name="add" size={16} strokeWidth={2} />
                <span>添加第一个</span>
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-notion-border -mx-5">
            {cashSources.map((cs) => (
              <li
                key={cs.id}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-notion-bg-alt/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-notion-text truncate">{cs.name}</div>
                  <div className="text-xs text-notion-text-muted mt-0.5 font-numeric flex items-center gap-2">
                    <span>余额 {formatYen(cs.balance)}</span>
                    {cs.locked_amount > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Icon name="lock" size={10} />
                        <span>锁定 {formatYen(cs.locked_amount)}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <Money amount={cs.balance - cs.locked_amount} size="md" />
                </div>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => setEditingCash(cs)}
                    className="text-notion-text-muted hover:text-notion-blue p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                    aria-label="编辑"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`删除「${cs.name}」？`)) {
                        await deleteCash(cs.id);
                        await loadDashboard();
                      }
                    }}
                    className="text-notion-text-muted hover:text-notion-warning p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                    aria-label="删除"
                  >
                    <Icon name="close" size={14} strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 信用卡明细 */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Icon name="card" size={18} className="text-notion-text-secondary" strokeWidth={1.75} />
            <span>信用卡 ({creditCards.length})</span>
          </div>
        }
        action={
          <button
            onClick={() => setShowAddCard(true)}
            className="btn-ghost text-notion-blue flex items-center gap-1"
          >
            <Icon name="add" size={14} strokeWidth={2} />
            <span>新增</span>
          </button>
        }
      >
        {creditCards.length === 0 ? (
          <EmptyState
            icon="card"
            title="还没有信用卡"
            description="添加待还款的信用卡，填写扣款日"
            action={
              <button onClick={() => setShowAddCard(true)} className="btn-primary flex items-center gap-1.5 mx-auto">
                <Icon name="add" size={16} strokeWidth={2} />
                <span>添加卡片</span>
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-notion-border -mx-5">
            {[...calc.active_cards.map((ac) => ({ ...ac.card, active: true, due_date: ac.due_date, days_until_due: ac.days_until_due })),
              ...calc.inactive_cards.map((c) => ({ ...c, active: false, due_date: '', days_until_due: -1 })),
            ].map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-notion-bg-alt/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-notion-text truncate flex items-center gap-2">
                    {c.name}
                    {c.active ? (
                      <span className="badge-warning badge text-[10px] px-1.5 py-0.5">
                        {c.days_until_due === 0 ? '今天扣款' : `${c.days_until_due} 天后扣款`}
                      </span>
                    ) : (
                      <span className="badge-muted badge text-[10px] px-1.5 py-0.5">
                        非本期
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-notion-text-muted mt-0.5">
                    每月 {c.due_day} 号扣款 · 账单 {formatYen(c.statement_amount)}
                  </div>
                </div>
                <div className="text-right">
                  <Money
                    amount={c.statement_amount}
                    size="md"
                    sign={c.active ? 'negative' : 'neutral'}
                  />
                </div>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => setEditingCard(c)}
                    className="text-notion-text-muted hover:text-notion-blue p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                    aria-label="编辑"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`删除「${c.name}」？`)) {
                        await deleteCard(c.id);
                        await loadDashboard();
                      }
                    }}
                    className="text-notion-text-muted hover:text-notion-warning p-1.5 rounded-micro hover:bg-notion-bg-alt transition-colors"
                    aria-label="删除"
                  >
                    <Icon name="close" size={14} strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 模态框 */}
      <Modal open={showAddCash || !!editingCash} onClose={() => { setShowAddCash(false); setEditingCash(null); }} title={editingCash ? '编辑现金来源' : '新增现金来源'}>
        <CashForm
          initial={editingCash ?? undefined}
          onSubmit={async (data) => {
            if (editingCash) await useStore.getState().updateCash(editingCash.id, data);
            else await useStore.getState().addCash(data);
            await loadDashboard();
            setShowAddCash(false);
            setEditingCash(null);
          }}
        />
      </Modal>

      <Modal open={showAddCard || !!editingCard} onClose={() => { setShowAddCard(false); setEditingCard(null); }} title={editingCard ? '编辑信用卡' : '新增信用卡'}>
        <CardForm
          initial={editingCard ? { name: editingCard.name, statement_amount: editingCard.statement_amount, due_day: editingCard.due_day } : undefined}
          onSubmit={async (data) => {
            if (editingCard) await useStore.getState().updateCard(editingCard.id, data);
            else await useStore.getState().addCard(data);
            await loadDashboard();
            setShowAddCard(false);
            setEditingCard(null);
          }}
        />
      </Modal>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  warning,
  highlight,
  icon,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  warning?: boolean;
  highlight?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt
        className={`text-sm flex items-center gap-1.5 ${
          muted ? 'text-notion-text-muted' : 'text-notion-text-secondary'
        }`}
      >
        {icon}
        <span>{label}</span>
      </dt>
      <dd
        className={`font-numeric text-sm ${
          highlight ? 'text-base font-bold text-notion-text' : bold ? 'font-bold text-notion-text' : ''
        } ${warning ? 'text-notion-warning' : ''} ${muted ? 'text-notion-text-muted' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}