/**
 * 成功率热力图：横轴 = 固定退休年龄，纵轴 = 退休后月支出，格子 = 钱撑到模拟结束的概率。
 * 单色顺序色阶（success 色从浅到深），每格都直接写百分比（颜色不单独承载信息）。
 * 点格子 → 把这个退休年龄 + 月支出应用到参数。
 */
import type { SuccessGrid } from '@cfp/shared';
import { yenCompact } from '../../lib/simulator';

function cellStyle(rate: number) {
  const mix = Math.round(8 + rate * 72); // 8% ~ 80%
  return {
    background: `color-mix(in oklch, var(--c-success) ${mix}%, var(--c-bg-alt))`,
    color: mix > 50 ? 'var(--c-bg)' : 'var(--c-text)',
  };
}

export function pctText(rate: number): string {
  if (rate >= 0.995) return '>99%';
  if (rate <= 0.005) return '<1%';
  return `${Math.round(rate * 100)}%`;
}

export function SuccessHeatmap({
  grid, currentAge, currentSpend, endAge, onPick, pending,
}: {
  grid: SuccessGrid;
  /** 当前方案的退休年龄（高亮最近的一列） */
  currentAge: number | null;
  /** 当前方案的退休后月支出（高亮最近的一行） */
  currentSpend: number;
  endAge: number;
  onPick: (age: number, spend: number) => void;
  pending: boolean;
}) {
  const nearest = (arr: number[], v: number | null) =>
    v === null ? -1 : arr.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(arr[best]! - v) ? i : best), 0);
  const ci = nearest(grid.ages, currentAge);
  const ri = nearest(grid.spends, currentSpend);
  // 支出高的放上面（和图表纵轴方向一致）
  const rows = grid.spends.map((spend, i) => ({ spend, i })).reverse();

  return (
    <div className={`transition-opacity ${pending ? 'opacity-60' : ''}`}>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="text-left text-[11px] font-semibold text-notion-text-muted pr-2 pb-1 whitespace-nowrap">月支出 ＼ 退休年龄</th>
              {grid.ages.map((a, j) => (
                <th key={a} className={`text-center text-[12px] font-semibold pb-1 font-numeric ${j === ci ? 'text-[var(--c-accent-text)]' : 'text-notion-text-secondary'}`}>
                  {a}岁
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ spend, i }) => (
              <tr key={spend}>
                <th className={`text-left text-[12px] font-numeric font-semibold pr-2 whitespace-nowrap ${i === ri ? 'text-[var(--c-accent-text)]' : 'text-notion-text-secondary'}`}>
                  {yenCompact(spend)}
                </th>
                {grid.ages.map((age, j) => {
                  const rate = grid.rates[i]![j]!;
                  const current = i === ri && j === ci;
                  return (
                    <td key={age} className="p-0">
                      <button
                        type="button"
                        onClick={() => onPick(age, spend)}
                        title={`${age} 岁退休、每月花 ${yenCompact(spend)}：钱撑到 ${endAge} 岁的概率 ${pctText(rate)}（点击应用）`}
                        aria-label={`${age} 岁退休，每月 ${yenCompact(spend)}，成功率 ${pctText(rate)}`}
                        className={`w-full min-w-[46px] h-9 xl:h-11 rounded-[6px] text-[12px] xl:text-[13px] font-numeric font-semibold tabular-nums transition-transform hover:scale-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent)] ${
                          current ? 'ring-2 ring-[var(--c-accent)] ring-offset-1 ring-offset-[var(--c-bg-elev)]' : ''
                        }`}
                        style={cellStyle(rate)}
                      >
                        {pctText(rate)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[11px] text-notion-text-muted">
        <span>0%</span>
        <span
          className="h-2 w-28 rounded-full"
          style={{ background: 'linear-gradient(to right, color-mix(in oklch, var(--c-success) 8%, var(--c-bg-alt)), color-mix(in oklch, var(--c-success) 80%, var(--c-bg-alt)))' }}
          aria-hidden="true"
        />
        <span>100%</span>
        <span className="ml-auto">框出的是当前方案 · 点格子可应用</span>
      </div>
    </div>
  );
}
