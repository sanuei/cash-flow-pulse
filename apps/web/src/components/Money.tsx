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
  color = 'default',
  animate = false,
  durationMs = 640,
}: {
  amount: number;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  className?: string;
  sign?: 'positive' | 'negative' | 'neutral';
  /**
   * 数字颜色：
   *   - default: 跟随 sign 或墨色（兼容旧调用）
   *   - accent:  主题色渐变（accent → accent-hover, 135deg），用于 hero 等"需要点亮"的场景
   */
  color?: 'default' | 'accent';
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

  const signColorClass =
    sign === 'positive'
      ? 'text-notion-success'
      : sign === 'negative'
      ? 'text-notion-warning'
      : 'text-notion-text';

  // accent 渐变：背景剪切文字,只显示字形的渐变填充
  // -webkit-text-fill-color: transparent 配合 background-clip 才能让字形透出
  const accentStyle: React.CSSProperties = color === 'accent'
    ? {
        backgroundImage: 'linear-gradient(135deg, var(--c-accent) 0%, var(--c-accent-hover) 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
      }
    : {};

  return (
    <span
      className={`font-numeric font-semibold tabular-nums ${sizeClass} ${color === 'accent' ? '' : signColorClass} ${className}`}
      style={accentStyle}
    >
      {formatYen(shown)}
    </span>
  );
}
