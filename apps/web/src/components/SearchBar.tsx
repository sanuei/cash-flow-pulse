import { Icon } from './Icon';

/** 各管理页顶部通用搜索栏 */
export function SearchBar({
  value,
  onChange,
  placeholder = '搜索...',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Icon
        name="search"
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-notion-text-muted pointer-events-none"
        strokeWidth={2}
      />
      <input
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-9 pr-4"
      />
    </div>
  );
}
