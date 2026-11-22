import { formatYen } from '@cfp/shared';

/** 收益金额 + 收益率（涨绿跌红，和券商 App 习惯一致） */
export function ReturnText({ gain, pct, className = '' }: { gain: number; pct: number | null; className?: string }) {
  const up = gain >= 0;
  const color = Math.abs(gain) < 0.5 ? 'var(--c-text-muted)' : up ? 'var(--c-success)' : 'var(--c-warning)';
  return (
    <span className={`font-numeric ${className}`} style={{ color }}>
      {up ? '+' : '−'}{formatYen(Math.abs(Math.round(gain)))}
      {pct !== null && <> · {pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%</>}
    </span>
  );
}
