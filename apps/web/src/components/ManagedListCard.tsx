import { useState, type ReactNode } from 'react';
import { Card } from './Card';
import { Modal } from './Modal';
import { EmptyState } from './States';
import { Icon, type IconName } from './Icon';

/**
 * ManagedListCard — 列表卡 + 增删改 Modal 骨架（v2 升级）
 *
 * 升级点：
 *   1) 列表项首次进入用 stagger 动画（--stagger utility，已在 index.css）
 *   2) 新增按钮在 hover 时 "+" 图标旋转 90°（160ms）
 *   3) 列表行 hover 时左侧 indicator 滑入（来自 EntityRow 内部）
 *   4) Modal 入场用 scale-in（与 Modal 组件统一）
 */
export function ManagedListCard<T>({
  icon,
  label,
  count,
  empty,
  formTitle,
  renderForm,
  footer,           // v1.4.6:可选的 footer 区域(用于显示合计等)
  children,
}: {
  icon: IconName;
  label: string;
  count: number;
  empty: { icon: IconName; title: string; description: string; addLabel: string };
  formTitle: (editing: T | null) => string;
  renderForm: (editing: T | null, close: () => void) => ReactNode;
  footer?: ReactNode;  // v1.4.6:底部合计行(可选,默认 undefined = 不显示)
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
      divided={count > 0}
      title={
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-[var(--radius-md)] bg-[var(--c-accent-soft)]">
            <Icon name={icon} size={15} className="text-[var(--c-accent-text)]" strokeWidth={1.75} />
          </span>
          <span>{label}</span>
          {count > 0 && (
            <span className="badge badge-muted text-[11px] px-2 py-0.5 ml-0.5">{count}</span>
          )}
        </div>
      }
      action={
        <button
          onClick={() => setShowAdd(true)}
          className="
            group flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius-pill)]
            text-[13px] font-semibold text-[var(--c-accent-text)] bg-[var(--c-accent-soft)]
            transition-all duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
            hover:bg-[var(--c-accent)] hover:text-[var(--c-text-on-accent)]
            active:scale-95
          "
        >
          <Icon
            name="add"
            size={14}
            strokeWidth={2}
            className="transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] group-hover:rotate-90"
          />
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
            <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5 mx-auto">
              <Icon name="add" size={16} strokeWidth={2} />
              <span>{empty.addLabel}</span>
            </button>
          }
        />
      ) : (
        // stagger — 第一行 0ms 延迟，第二行 60ms，依次递增
        <ul className="stagger divide-y divide-[var(--c-border)] -mx-5 -mb-5 overflow-hidden rounded-b-[var(--radius-xl)]">
          {children(setEditing)}
        </ul>
      )}

      {/* v1.4.6:底部合计/汇总行(可选) */}
      {footer && (
        <div className="mt-3 pt-3 border-t border-[var(--c-border)]">
          {footer}
        </div>
      )}

      <Modal open={showAdd || editing !== null} onClose={close} title={formTitle(editing)} icon={icon}>
        {renderForm(editing, close)}
      </Modal>
    </Card>
  );
}
