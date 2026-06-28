/**
 * Cash Flow Pulse — 品牌 Logo
 *
 * v1.4: 用用户提供的 PNG 位图(纯文字版,无装饰)
 * 优点: 100% 还原用户设计稿
 * 缺点: 无法跟随主题反色(文字深色在 dark/neon 主题下接近不可见)
 *      折中: 用 CSS filter: invert(1) 在深色主题下反色
 */

export function Logo({
  size = 28,
  className = '',
}: {
  /** logo 高度(像素),宽度按原图比例自动算出 */
  size?: number;
  className?: string;
}) {
  // 原图裁剪后 972x126 ≈ 7.7:1
  const width = Math.round(size * 972 / 126);

  return (
    <img
      src="/logo.webp"
      alt="cashflow"
      width={width}
      height={size}
      className={`logo-themed ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
    />
  );
}
