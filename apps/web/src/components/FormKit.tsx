import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * FormKit — 统一的编辑表单原语，建立主次层级：
 *   - HeroAmount：金额作为主角（大号衬线数字，默认 autofocus）
 *   - Field：次要字段（名称、日期等）
 *   - Segmented：分段选择（频率/周期）
 *   - Collapsible：折叠次要/高级字段（默认收起）
 *   - FormActions：吸底「取消 / 保存」
 *   - FormError：统一错误条
 */

type Tone = 'neutral' | 'success' | 'warning' | 'accent';

export function HeroAmount({
  label,
  value,
  onChange,
  tone = 'neutral',
  autoFocus = true,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  tone?: Tone;
  autoFocus?: boolean;
}) {
  const display = value ? value.toLocaleString('en-US') : '';
  const color =
    tone === 'success' ? 'var(--c-success)'
    : tone === 'warning' ? 'var(--c-warning)'
    : tone === 'accent' ? 'var(--c-accent-text)'
    : 'var(--c-text)';
  return (
    <div className="text-center pt-1 pb-1">
      <label className="block text-[12px] font-medium text-notion-text-muted mb-2">{label}</label>
      <div className="flex items-center justify-center gap-1.5 max-w-[280px] mx-auto border-b-2 border-[var(--c-border)] focus-within:border-[var(--c-accent)] transition-colors pb-2">
        <span className="font-display text-[24px] leading-none text-notion-text-muted">¥</span>
        <input
          type="text"
          inputMode="numeric"
          autoFocus={autoFocus}
          aria-label={label}
          className="font-display font-semibold text-[40px] leading-none bg-transparent border-0 p-0 w-full text-center focus:outline-none tabular-nums placeholder:text-[var(--c-text-muted)]"
          style={{ color }}
          value={display}
          placeholder="0"
          onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-notion-text-muted mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="grid gap-1 p-1 bg-[var(--c-bg-alt)] rounded-[var(--radius-md)]"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2 py-2 rounded-[var(--radius-sm)] text-[13px] font-semibold transition-all duration-[var(--dur-base)] ease-[var(--ease-out-expo)] ${
            value === o.value
              ? 'bg-[var(--c-accent)] text-[var(--c-text-on-accent)] shadow-[var(--shadow-xs)]'
              : 'text-notion-text-secondary hover:text-notion-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Collapsible({
  label = '更多设置',
  children,
  defaultOpen = false,
}: {
  label?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-[var(--c-border)] pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-notion-text-secondary hover:text-notion-text transition-colors"
      >
        <Icon
          name="chevron-down"
          size={14}
          className={`transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)] ${open ? '' : '-rotate-90'}`}
        />
        <span>{label}</span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-[var(--dur-medium)] ease-[var(--ease-out-expo)]"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="pt-4 space-y-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function FormError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="text-sm text-notion-warning bg-[var(--c-warning-soft)] px-3 py-2 rounded-[var(--radius-sm)]">
      {msg}
    </div>
  );
}

export function FormActions({
  onCancel,
  saving,
  disabled = false,
  saveLabel = '保存',
}: {
  onCancel?: () => void;
  saving: boolean;
  disabled?: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-[var(--c-bg-elev)] border-t border-[var(--c-border)] flex gap-2">
      {onCancel && (
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={saving}>
          取消
        </button>
      )}
      <button type="submit" className="btn-primary flex-1" disabled={saving || disabled}>
        {saving ? '保存中...' : saveLabel}
      </button>
    </div>
  );
}
