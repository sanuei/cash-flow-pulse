import { useState, useRef, useId, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { useSwipeReveal } from '../lib/swipeReveal';

// 触屏端：保留原有的"滑开→再点"两段式删除手势
// 桌面端：用三点菜单折叠次要操作，避免编辑/删除按钮过近造成的误触
// —— Linear / Notion / Things 的同款做法。
//
// 菜单用 createPortal 渲染到 document.body（而不是 EntityRow 内部），
// 原因是 ManagedListCard 里的 <ul className="... overflow-hidden ..."> 会把
// 超出卡片底部的下拉裁掉。Portal 出去后菜单永远在最外层 z-stack 顶端，
// 跟任何 overflow 上下文无关。

const SWIPE_REVEAL_WIDTH = 76;    // px：滑开后露出的删除按钮宽度（也是最大可拖动距离）
const SWIPE_REVEAL_TRIGGER = 40;  // px：松手时超过此距离才"锁定展开"，否则弹回

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

  // 滑动删除是两段式手势：滑开只"露出"删除按钮，松手不会直接删；
  // 必须再单独点一下露出的按钮才真正触发——避免列表滚动时轻微斜滑就误删。
  const rowId = useId();
  const openId = useSwipeReveal((s) => s.openId);
  const setOpenId = useSwipeReveal((s) => s.setOpen);
  const revealed = openId === rowId;

  const [swipeX, setSwipeX] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);

  // 桌面端三点菜单的展开状态：单击三点图标展开，再点别处/Escape/触发删除后收起
  // 菜单用 createPortal 渲染到 document.body（详见顶部注释），所以这里维护的是
  // "打开/关闭 + 坐标"两套状态。
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);  // 三点按钮自身
  const menuRef = useRef<HTMLDivElement>(null);        // 渲染到 body 的菜单本体
  // 菜单坐标（viewport 坐标，配 fixed 定位用）；null 表示菜单未挂载
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  // 在菜单打开时记录触发按钮的视口位置；之后滚动/resize 时同步跟随移动
  useLayoutEffect(() => {
    if (!menuOpen) { setMenuPos(null); return; }
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // 菜单右下角对齐按钮右下角，再向上 4px 留出小间隙
      setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [menuOpen]);
  // 点别处 / Escape → 收起菜单（菜单是 portal 到 body 的，所以"包含判断"
  // 要把 trigger 按钮本身排除，否则"再点按钮关闭"这条主流交互会被吞掉）
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      // 点 trigger（按钮本身）允许再次关闭，不算"点别处"
      if (triggerRef.current?.contains(t)) return;
      // 点菜单内部不关（菜单内的点击有自己的 handler 决定）
      if (menuRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [menuOpen]);

  // 别的行被滑开时，本行如果处于展开态要自动收起
  useEffect(() => {
    if (!revealed && swipeX !== 0) {
      setSnapping(true);
      setSwipeX(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0]?.clientX ?? 0;
    startY.current = e.touches[0]?.clientY ?? 0;
    dragging.current = true;
    setSnapping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const currentX = e.touches[0]?.clientX ?? startX.current;
    const currentY = e.touches[0]?.clientY ?? startY.current;
    const dx = startX.current - currentX; // >0 = 手指向左移
    const dy = Math.abs(startY.current - currentY);

    if (revealed) {
      // 已展开：向右拖一段距离就收起（符合直觉的"推回去"手势）
      if (dx < -20) {
        setSnapping(true);
        setSwipeX(0);
        setOpenId(null);
        dragging.current = false;
      }
      return;
    }

    // 未展开：只响应水平滑动（dx > dy），避免干扰竖向滚动
    if (dx > 0 && dx > dy) {
      setSwipeX(Math.min(dx, SWIPE_REVEAL_WIDTH));
    }
  };

  const handleTouchEnd = () => {
    dragging.current = false;
    setSnapping(true);
    if (swipeX >= SWIPE_REVEAL_TRIGGER) {
      // 只是"锁定展开"，露出删除按钮——不在这里直接删除
      setSwipeX(SWIPE_REVEAL_WIDTH);
      setOpenId(rowId);
    } else {
      setSwipeX(0);
      if (revealed) setOpenId(null);
    }
  };

  const handleConfirmDelete = () => {
    setOpenId(null);
    setSwipeX(0);
    onDelete();
  };

  // 点击行内容本体：若处于展开态，视为"点别处收起"，不触发编辑
  const handleContentClick = () => {
    if (revealed) {
      setSnapping(true);
      setSwipeX(0);
      setOpenId(null);
    }
  };

  // 鼠标端：从三点菜单里点删除（菜单本身就是「需要多一步才能触发」的天然屏障），
  // 触发后弹原生 confirm 二次确认——双重保险，误触概率降到接近 0。
  const handleMenuDelete = () => {
    setMenuOpen(false);
    if (window.confirm('确定要删除这一项吗？')) onDelete();
  };

  return (
    <li
      className={`
        group relative overflow-hidden
        transition-[opacity,transform] duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
        ${leaving ? 'opacity-0 -translate-x-2' : 'opacity-100'}
      `}
    >
      {/* 删除背景层：滑动过程中是纯装饰，锁定展开后变成真正可点的按钮 */}
      <button
        type="button"
        aria-hidden={!revealed}
        tabIndex={revealed ? 0 : -1}
        onClick={revealed ? handleConfirmDelete : undefined}
        className="absolute inset-y-0 right-0 flex items-center justify-center gap-1"
        style={{
          width: swipeX,
          background: revealed ? 'var(--c-warning)' : `color-mix(in oklch, var(--c-warning) ${Math.round((swipeX / SWIPE_REVEAL_WIDTH) * 100)}%, var(--c-warning-soft))`,
          opacity: swipeX > 4 ? 1 : 0,
          pointerEvents: revealed ? 'auto' : 'none',
          transition: snapping ? `width 280ms var(--ease-out-expo), background 150ms` : 'none',
        }}
      >
        {swipeX > 36 && (
          <div className="flex flex-col items-center gap-0.5 text-[var(--c-text-on-accent)]">
            <Icon name="close" size={15} strokeWidth={2} />
            <span className="text-[10px] font-semibold leading-none">删除</span>
          </div>
        )}
      </button>

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
        onClick={handleContentClick}
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

        {/* 编辑按钮（始终可见，主操作）+ 三点菜单（hover 才显，桌面端专用，
            触屏走"滑开→再点"两段式手势，菜单按钮隐藏避免和滑动手势冲突） */}
        <div className="flex shrink-0 items-center">
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

          {/* 三点菜单触发按钮：仅桌面端显示，hover 行才出现（与 group hover 同步） */}
          <div className="relative hidden md:block opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--dur-fast)]">
            <button
              ref={triggerRef}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
              className={`
                p-1.5 rounded-[var(--radius-sm)]
                text-[var(--c-text-muted)] hover:text-[var(--c-text-secondary)]
                hover:bg-[var(--c-bg-elev)]
                transition-all duration-[var(--dur-fast)] ease-[var(--ease-out-expo)]
                ${menuOpen ? 'bg-[var(--c-bg-elev)] text-[var(--c-text-secondary)]' : ''}
              `}
              aria-label="更多操作"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <Icon name="more" size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      {/* 三点菜单本体：用 createPortal 渲染到 document.body，避开父级
          ManagedListCard 的 <ul className="... overflow-hidden ..."> 裁剪；
          定位用 fixed + 触发按钮的 getBoundingClientRect() 计算（见 useLayoutEffect） */}
      {menuOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'fixed',
            top: menuPos.top,
            right: menuPos.right,
            zIndex: 50,
          }}
          className="
            min-w-[140px] py-1
            bg-[var(--c-bg-overlay)] backdrop-blur-md
            border border-[var(--c-border)] rounded-[var(--radius-md)]
            shadow-[var(--shadow-popover)]
            origin-top-right
            animate-scale-in
          "
          onClick={(e) => e.stopPropagation()}
        >
          <button
            role="menuitem"
            onClick={handleMenuDelete}
            className="
              w-full flex items-center gap-2 px-3 py-2 text-[13px]
              text-[var(--c-warning)] hover:bg-[var(--c-warning-soft)]
              transition-colors duration-[var(--dur-fast)]
            "
          >
            <Icon name="trash" size={14} strokeWidth={1.75} />
            <span>删除</span>
          </button>
        </div>,
        document.body,
      )}
    </li>
  );
}
