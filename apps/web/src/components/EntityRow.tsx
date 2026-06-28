import { useState, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

const SWIPE_DELETE_THRESHOLD = 90;  // px：超过此距离放手才触发删除
const SWIPE_MAX = 110;              // px：最大滑动距离

export function EntityRow({
  title,
  subtitle,
  money,
  icon,
  tone = 'neutral',
  onEdit,
  onDelete,
  leaving = false,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  money: ReactNode;
  icon?: IconName;
  tone?: 'neutral' | 'accent' | 'success' | 'warning';
  onEdit: () => void;
  onDelete: () => void;
  leaving?: boolean;
}) {
  const toneClass = {
    neutral: 'bg-[var(--c-bg-alt)] text-[var(--c-text-secondary)]',
    accent:  'bg-[var(--c-accent-soft)] text-[var(--c-accent-text)]',
    success: 'bg-[var(--c-success-soft)] text-[var(--c-success)]',
    warning: 'bg-[var(--c-warning-soft)] text-[var(--c-warning)]',
  }[tone];

  const [swipeX, setSwipeX] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0]?.clientX ?? 0;
    startY.current = e.touches[0]?.clientY ?? 0;
    dragging.current = true;
    setSnapping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = startX.current - (e.touches[0]?.clientX ?? startX.current);
    const dy = Math.abs(startY.current - (e.touches[0]?.clientY ?? startY.current));
    // 只响应水平滑动（dx > dy），避免干扰竖向滚动
    if (dx > 0 && dx > dy) {
      setSwipeX(Math.min(dx, SWIPE_MAX));
    }
  };

  const handleTouchEnd = () => {
    dragging.current = false;
    setSnapping(true);
    if (swipeX >= SWIPE_DELETE_THRESHOLD) {
      onDelete();
    }
    setSwipeX(0);
  };

  const deleteProgress = Math.min(swipeX / SWIPE_DELETE_THRESHOLD, 1);
  const deleteReady = swipeX >= SWIPE_DELETE_THRESHOLD;

  return (
    <li
      className={`
        group relative overflow-hidden
        transition-[opacity,transform] duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
        ${leaving ? 'opacity-0 -translate-x-2' : 'opacity-100'}
      `}
    >
      {/* 删除背景层（左滑后从右侧露出） */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 flex items-center justify-center gap-1"
        style={{
          width: swipeX,
          background: deleteReady ? 'var(--c-warning)' : `color-mix(in oklch, var(--c-warning) ${Math.round(deleteProgress * 100)}%, var(--c-warning-soft))`,
          opacity: deleteProgress > 0.05 ? 1 : 0,
          transition: snapping ? `width 280ms var(--ease-out-expo), background 150ms` : 'none',
        }}
      >
        {swipeX > 36 && (
          <div className={`flex flex-col items-center gap-0.5 transition-opacity duration-[var(--dur-fast)] ${deleteReady ? 'text-[var(--c-text-on-accent)]' : 'text-[var(--c-warning)]'}`}>
            <Icon name="close" size={15} strokeWidth={2} />
            <span className="text-[10px] font-semibold leading-none">删除</span>
          </div>
        )}
      </div>

      {/* 行内容层（随手势向左平移） */}
      <div
        className="relative flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--c-bg-alt)]"
        style={{
          transform: `translateX(-${swipeX}px)`,
          transition: snapping ? `transform 280ms var(--ease-out-expo)` : 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 左侧 indicator */}
        <span
          className="
            absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px]
            bg-[var(--c-accent)] rounded-r-full
            origin-left scale-x-0 group-hover:scale-x-100
            transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
          "
          aria-hidden="true"
        />

        {/* 前导图标贴片 */}
        {icon && (
          <span
            className={`
              flex-shrink-0 flex items-center justify-center w-9 h-9
              rounded-[var(--radius-md)] ${toneClass}
              transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
              group-hover:scale-105
            `}
          >
            <Icon name={icon} size={16} strokeWidth={1.75} />
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="font-medium text-[14px] text-notion-text truncate leading-snug">{title}</div>
          <div className="text-[12px] text-notion-text-muted mt-0.5 truncate">{subtitle}</div>
        </div>

        <div className="text-right shrink-0">{money}</div>

        {/* 编辑按钮（始终可见）+ 删除按钮（仅鼠标设备 hover 显示，触屏靠左滑） */}
        <div className="flex gap-0.5 shrink-0">
          <button
            onClick={onEdit}
            className="
              p-1.5 rounded-[var(--radius-sm)]
              text-[var(--c-text-muted)] hover:text-[var(--c-accent)]
              hover:bg-[var(--c-bg-elev)]
              transition-all duration-[var(--dur-fast)] ease-[var(--ease-out-expo)]
              hover:rotate-12
            "
            aria-label="编辑"
          >
            <Icon name="edit" size={14} strokeWidth={1.75} />
          </button>
          {/* 仅在支持 hover 的设备（桌面端）显示删除按钮 */}
          <button
            onClick={onDelete}
            className="
              hidden [@media(hover:hover)]:inline-flex
              p-1.5 rounded-[var(--radius-sm)]
              text-[var(--c-text-muted)] hover:text-[var(--c-warning)]
              hover:bg-[var(--c-bg-elev)] items-center justify-center
              transition-all duration-[var(--dur-fast)] ease-[var(--ease-out-expo)]
              opacity-0 group-hover:opacity-100
            "
            aria-label="删除"
          >
            <Icon name="close" size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </li>
  );
}
