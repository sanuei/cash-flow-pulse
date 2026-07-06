/**
 * MoneyInput — 金额输入框
 *   1) 左侧常驻 ¥ 符号
 *   2) 实时千分位显示（30000 → 30,000）
 *   3) 衬线等宽数字；无 number 步进箭头
 *   4) 值为 0 时显示淡色真实「0」（非 placeholder），聚焦即全选：
 *      光标自然落在 0 之后而非与之重叠，输入任意数字直接替换、不留前导 0
 */
export function MoneyInput({
  value,
  onChange,
  autoFocus = false,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const isZero = !value;
  const display = value ? value.toLocaleString('en-US') : '0';
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
        className={`input font-numeric pl-7 ${isZero ? 'text-notion-text-muted' : ''}`}
        value={display}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
      />
    </div>
  );
}
