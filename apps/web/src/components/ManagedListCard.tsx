import { useState, type ReactNode } from 'react';
import { Card } from './Card';
import { Modal } from './Modal';
import { EmptyState } from './States';
import { Icon, type IconName } from './Icon';

/**
 * 通用「列表卡 + 增删改 Modal」骨架。
 *
 * 内部管理「新增 / 编辑」弹窗状态，调用方只需提供：
 * - children：列表项渲染（回调里拿到 openEdit，用于行内编辑按钮）
 * - renderForm：表单渲染（拿到当前编辑对象 editing + close 回调）
 *
 * 泛型 T = 该列表的数据类型（CashSource / RecurringIncome / ...）。
 */
export function ManagedListCard<T>({
  icon,
  label,
  count,
  empty,
  formTitle,
  renderForm,
  children,
}: {
  icon: IconName;
  label: string;
  count: number;
  empty: { icon: IconName; title: string; description: string; addLabel: string };
  formTitle: (editing: T | null) => string;
  renderForm: (editing: T | null, close: () => void) => ReactNode;
  children: (openEdit: (item: T) => void) => ReactNode;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const close = () => {
    setShowAdd(false);
    setEditing(null);
  };

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Icon name={icon} size={18} className="text-notion-text-secondary" strokeWidth={1.75} />
          <span>{label} ({count})</span>
        </div>
      }
      action={
        <button
          onClick={() => setShowAdd(true)}
          className="btn-ghost text-notion-blue flex items-center gap-1"
        >
          <Icon name="add" size={14} strokeWidth={2} />
          <span>新增</span>
        </button>
      }
    >
      {count === 0 ? (
        <EmptyState
          icon={empty.icon}
          title={empty.title}
          description={empty.description}
          action={
            <button
              onClick={() => setShowAdd(true)}
              className="btn-primary flex items-center gap-1.5 mx-auto"
            >
              <Icon name="add" size={16} strokeWidth={2} />
              <span>{empty.addLabel}</span>
            </button>
          }
        />
      ) : (
        <ul className="divide-y divide-notion-border -mx-5">{children(setEditing)}</ul>
      )}

      <Modal open={showAdd || editing !== null} onClose={close} title={formTitle(editing)}>
        {renderForm(editing, close)}
      </Modal>
    </Card>
  );
}
