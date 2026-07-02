import { Icon, type IconName } from './Icon';

/** 各页面统一的标题头（图标 + 标题 + 副标题 + 可选右侧总计）。 */
export function PageTitle({
  icon,
  title,
  subtitle,
  total,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** v1.5: 页面级总计（如"总计 ¥xxx"），显示在标题右侧 */
  total?: { label: string; value: string };
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight-section flex items-center gap-2">
          <Icon name={icon} size={28} strokeWidth={1.5} className="text-notion-text-secondary" />
          <span>{title}</span>
        </h1>
        {subtitle && <p className="text-sm text-notion-text-secondary mt-1">{subtitle}</p>}
      </div>
      {total && (
        <div className="text-right flex-shrink-0 pt-1">
          <div className="text-[11px] uppercase tracking-caps text-notion-text-muted font-semibold">
            {total.label}
          </div>
          <div className="font-display font-semibold text-xl sm:text-2xl font-numeric text-notion-text mt-0.5">
            {total.value}
          </div>
        </div>
      )}
    </header>
  );
}
