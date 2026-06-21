import { formatYen } from '@cfp/shared';

/**
 * 数字展示组件：自动 ¥ 前缀 + 千分位 + 等宽数字
 */
export function Money({
  amount,
  size = 'md',
  className = '',
  sign,
}: {
  amount: number;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  className?: string;
  sign?: 'positive' | 'negative' | 'neutral';
}) {
  const sizeClass = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-3xl',
    hero: 'text-5xl sm:text-6xl',
  }[size];

  const colorClass =
    sign === 'positive'
      ? 'text-notion-success'
      : sign === 'negative'
      ? 'text-notion-warning'
      : 'text-notion-text';

  return (
    <span className={`font-numeric font-semibold ${sizeClass} ${colorClass} ${className}`}>
      {formatYen(amount)}
    </span>
  );
}