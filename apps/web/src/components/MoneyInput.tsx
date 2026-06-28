/**
 * MoneyInput — 金额输入框
 *   1) 左侧常驻 ¥ 符号
 *   2) 实时千分位显示（30000 → 30,000）
 *   3) 衬线等宽数字；无 number 步进箭头
 */
export function MoneyInput({
  value,
  onChange,
  placeholder = '0',
  autoFocus = false,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const display = value ? value.toLocaleString('en-US') : '';
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-notion-text-muted font-numeric">
        ¥
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className="input font-numeric pl-7"
        value={display}
        placeholder={placeholder}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
      />
    </div>
  );
}
