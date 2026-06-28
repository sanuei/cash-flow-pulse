import { formatYen } from '@cfp/shared';
import { useCountUp } from '../lib/motion';

/**
 * Money — 金额展示组件（v2 升级）
 *
 * 升级点：
 *   1) 默认使用 Fraunces 衬线数字（font-numeric）— 印刷质感
 *   2) animate=true 时从旧值翻动到新值（count-up，640ms ease-out-expo）
 *   3) 减运动场景下直接显示终值
 *   4) 字号与字距随 size 切换：hero 用 display 字距收紧（-0.025em）
 */
export function Money({
  amount,
  size = 'md',
  className = '',
  sign,
  animate = false,
  durationMs = 640,
}: {
  amount: number;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  className?: string;
  sign?: 'positive' | 'negative' | 'neutral';
  /** 是否启用 count-up 翻动动画（默认关闭，避免每次渲染都触发） */
  animate?: boolean;
  durationMs?: number;
}) {
  // 翻动目标 — 整型化避免 ¥1234.56 抖动
  const display = useCountUp(Math.round(amount), durationMs);
  const shown = animate ? display : amount;

  // 字号阶梯 — 用 clamp 保证在不同视口都协调
  const sizeClass = {
    sm:   'text-sm',
    md:   'text-base',
    lg:   'text-xl tracking-tight-section',
    xl:   'text-3xl tracking-tight-display',
    hero: 'text-[44px] sm:text-[56px] leading-[1.05] tracking-tight-display',
  }[size];

  const colorClass =
    sign === 'positive'
      ? 'text-notion-success'
      : sign === 'negative'
      ? 'text-notion-warning'
      : 'text-notion-text';

  return (
    <span
      className={`font-numeric font-semibold tabular-nums ${sizeClass} ${colorClass} ${className}`}
    >
      {formatYen(shown)}
    </span>
  );
}
