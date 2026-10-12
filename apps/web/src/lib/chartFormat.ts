/** 金额轴刻度：< 100 万用 k，≥ 100 万用 M（"1,200k" 在 40px 宽的轴上会被截成 ".200k"） */
export function yenAxisTick(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) {
    const m = v / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `${Math.round(v / 1000)}k`;
}
