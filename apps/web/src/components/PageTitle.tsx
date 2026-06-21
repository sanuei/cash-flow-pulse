import { Icon, type IconName } from './Icon';

/** 各页面统一的标题头（图标 + 标题 + 副标题）。 */
export function PageTitle({
  icon,
  title,
  subtitle,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
}) {
  return (
    <header>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight-section flex items-center gap-2">
        <Icon name={icon} size={28} strokeWidth={1.5} className="text-notion-text-secondary" />
        <span>{title}</span>
      </h1>
      {subtitle && <p className="text-sm text-notion-text-secondary mt-1">{subtitle}</p>}
    </header>
  );
}
