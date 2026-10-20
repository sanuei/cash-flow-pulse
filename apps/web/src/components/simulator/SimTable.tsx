/**
 * 逐年明细表（单位：万円，可切名义/实际）+ 导出 CSV（完整日元）
 */
import type { SimInput, SimResult, SimYearRow } from '@cfp/shared';
import { Icon } from '../Icon';
import { nominalFactor } from './SimCharts';

type Col = { key: keyof SimYearRow | 'eventsNet'; label: string; flow?: boolean; signed?: boolean };

const COLS: Col[] = [
  { key: 'startTotal', label: '期初资产' },
  { key: 'income', label: '工资', flow: true },
  { key: 'pension', label: '养老金', flow: true },
  { key: 'spend', label: '生活支出', flow: true },
  { key: 'eventsNet', label: '大事件', flow: true, signed: true },
  { key: 'contribution', label: '投入投资', flow: true },
  { key: 'returns', label: '收益', flow: true, signed: true },
  { key: 'withdrawal', label: '卖出投资', flow: true },
  { key: 'tax', label: '税', flow: true },
  { key: 'endTotal', label: '期末资产' },
];

function wan(v: number): string {
  const n = Math.round(v / 1e4);
  return n === 0 && v !== 0 ? (v > 0 ? '<1' : '>−1') : n.toLocaleString('ja-JP');
}

export function SimTable({ input, result, nominal }: { input: SimInput; result: SimResult; nominal: boolean }) {
  const startYear = new Date().getFullYear();
  const fireYear = result.fireMonth !== null ? Math.floor(result.fireMonth / 12) : null;
  const retireYear = result.retireMonth !== null ? Math.floor(result.retireMonth / 12) : null;
  const depletedYear = result.depletedAge !== null ? Math.floor((result.depletedAge - input.startAge)) : null;

  const value = (r: SimYearRow, c: Col) => {
    const raw = r[c.key] as number;
    // 期初值用年初系数，其余（流量和期末）用年末系数
    const t = c.key === 'startTotal' ? r.year : r.year + 1;
    return raw * nominalFactor(input, nominal, t);
  };

  const exportCsv = () => {
    const head = ['年份', '年龄', ...COLS.map((c) => c.label), '本金', '累计收益', '目标完成度%', '状态'];
    const lines = result.rows.map((r) => [
      startYear + r.year,
      r.age,
      ...COLS.map((c) => Math.round(value(r, c))),
      Math.round(r.principal * nominalFactor(input, nominal, r.year + 1)),
      Math.round(r.gains * nominalFactor(input, nominal, r.year + 1)),
      Math.round(r.progressPct),
      r.retired ? '退休' : '工作',
    ].join(','));
    const csv = '﻿' + [head.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `财富模拟_${nominal ? '名义' : '今天购买力'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-[12px] text-notion-text-muted">单位：万円 · {nominal ? '名义金额' : '按今天的购买力'}</span>
        <button onClick={exportCsv} className="btn-ghost flex items-center gap-1 text-[12px]">
          <Icon name="export-csv" size={13} />
          <span>导出 CSV</span>
        </button>
      </div>
      <div className="-mx-5 overflow-x-auto max-h-[520px] overflow-y-auto border-t border-[var(--c-border)]">
        <table className="w-full text-[12px] font-numeric tabular-nums border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--c-bg-elev)]">
            <tr className="text-notion-text-muted">
              <th className="text-left font-semibold px-3 py-2 pl-5 whitespace-nowrap">年份</th>
              <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">年龄</th>
              {COLS.map((c) => (
                <th key={c.key} className="text-right font-semibold px-2 py-2 whitespace-nowrap">{c.label}</th>
              ))}
              <th className="text-right font-semibold px-3 py-2 pr-5 whitespace-nowrap">完成度</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => {
              const tag = r.year === fireYear ? { t: '自由', c: '' }
                : r.year === depletedYear ? { t: '耗尽', c: 'badge-warning' }
                : r.year === retireYear ? { t: '退休', c: 'badge-muted' }
                : null;
              return (
                <tr key={r.year} className={`border-t border-[var(--c-border)] ${r.retired ? 'bg-[var(--c-bg-alt)]' : ''}`}>
                  <td className="text-left px-3 py-1.5 pl-5 whitespace-nowrap text-notion-text-secondary">
                    {startYear + r.year}
                    {tag && <span className={`badge ${tag.c} ml-1.5 !text-[10px] !px-1.5 !py-0`}>{tag.t}</span>}
                  </td>
                  <td className="text-left px-2 py-1.5 text-notion-text-secondary">{r.age}</td>
                  {COLS.map((c) => {
                    const v = value(r, c);
                    const tone = c.signed && v < 0 ? 'text-notion-warning' : c.key === 'endTotal' ? 'text-notion-text font-semibold' : v === 0 ? 'text-notion-text-muted' : 'text-notion-text';
                    return (
                      <td key={c.key} className={`text-right px-2 py-1.5 whitespace-nowrap ${tone}`}>
                        {v === 0 && c.flow ? '—' : wan(v)}
                      </td>
                    );
                  })}
                  <td className="text-right px-3 py-1.5 pr-5 text-notion-text-secondary">{Math.round(r.progressPct)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
