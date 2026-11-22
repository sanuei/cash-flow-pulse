import { useMemo, useState } from 'react';
import { analyzeAssetStructure, formatYen, quoteKey, type StructureSlice } from '@cfp/shared';
import { Card } from './Card';
import { Icon } from './Icon';
import { useStore } from '../lib/store';

/**
 * 资产页「资产结构」：按类型 / 按投资地区 / 集中度（最大持仓）。
 * 颜色按类别固定（不随排名变），每段都有图例 + 金额 + 占比，不只靠颜色区分。
 */

const TYPE_COLOR: Record<string, string> = {
  cash: 'var(--c-text-muted)',
  index: 'var(--c-invest)',
  stock: 'var(--c-accent)',
  active: 'var(--c-success)',
  crypto: 'var(--c-warning)',
  unknown: 'var(--c-border-strong)',
  other: 'var(--c-text-secondary)',
};
const REGION_COLOR: Record<string, string> = {
  jp: 'var(--c-text-muted)',
  us: 'var(--c-invest)',
  global: 'var(--c-success)',
  cn: 'var(--c-accent)',
  other_region: 'var(--c-text-secondary)',
  crypto: 'var(--c-warning)',
  unknown: 'var(--c-border-strong)',
};

type Tab = 'type' | 'region' | 'top';
const TABS: { key: Tab; label: string }[] = [
  { key: 'type', label: '按类型' },
  { key: 'region', label: '按地区' },
  { key: 'top', label: '集中度' },
];

export function AssetStructureCard() {
  const cashSources = useStore((s) => s.cashSources);
  const otherAssets = useStore((s) => s.otherAssets);
  const holdings = useStore((s) => s.holdings);
  const quotes = useStore((s) => s.quotes);
  const fx = useStore((s) => s.fx);
  const [tab, setTab] = useState<Tab>('type');

  const st = useMemo(() => analyzeAssetStructure({
    cashSources, otherAssets, holdings, fx,
    quotes: new Map(quotes.map((q) => [quoteKey(q.kind, q.symbol), q])),
  }), [cashSources, otherAssets, holdings, quotes, fx]);

  if (st.total <= 0) return null;
  const investPct = Math.round((st.invest / st.total) * 1000) / 10;

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Icon name="pie" size={16} className="text-[var(--c-accent-text)]" strokeWidth={1.75} />
          <span>资产结构</span>
        </div>
      }
      action={
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-2.5 py-1 rounded-[var(--radius-pill)] text-[12px] font-semibold transition-colors ${
                tab === t.key ? 'bg-[var(--c-accent-soft)] text-[var(--c-accent-text)]' : 'text-notion-text-secondary hover:bg-[var(--c-bg-alt)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 mb-4">
        <div>
          <div className="text-[11px] text-notion-text-muted">总资产</div>
          <div className="font-display font-semibold text-[28px] leading-tight text-notion-text">{formatYen(st.total)}</div>
        </div>
        <div className="text-right text-[12px] text-notion-text-muted">
          投资 <span className="font-numeric text-notion-text-secondary">{formatYen(st.invest)}</span>（{investPct}%）
        </div>
      </div>

      {tab === 'type' && <SliceView slices={st.byType} colors={TYPE_COLOR} />}
      {tab === 'region' && (
        <>
          <SliceView slices={st.byRegion} colors={REGION_COLOR} />
          <p className="text-[10.5px] text-notion-text-muted mt-2">基金按名称判断投资地区（如 eMAXIS S&P500 虽然以日元计价，算美国）；现金算日本。</p>
        </>
      )}
      {tab === 'top' && <TopView top={st.top} />}
    </Card>
  );
}

function SliceView({ slices, colors }: { slices: StructureSlice[]; colors: Record<string, string> }) {
  return (
    <div className="space-y-3">
      {/* 横向堆叠条：段间 2px 缝，两端 4px 圆角 */}
      <div className="flex h-3 gap-[2px]" role="img" aria-label={slices.map((s) => `${s.label} ${s.pct}%`).join('，')}>
        {slices.map((s) => (
          <div
            key={s.key}
            title={`${s.label} ${formatYen(s.value)}（${s.pct}%）`}
            className="min-w-[3px] first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ flex: s.value, background: colors[s.key] }}
          />
        ))}
      </div>
      <div className="divide-y divide-[var(--c-border)]">
        {slices.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-[13px] py-2">
            <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: colors[s.key] }} aria-hidden="true" />
            <span className="text-notion-text-secondary">{s.label}</span>
            <span className="font-numeric ml-auto tabular-nums text-notion-text">{formatYen(s.value)}</span>
            <span className="w-12 text-right flex-shrink-0 font-numeric tabular-nums text-notion-text-muted">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopView({ top }: { top: ReturnType<typeof analyzeAssetStructure>['top'] }) {
  if (top.length === 0) {
    return <p className="text-[12px] text-notion-text-secondary">给证券账户添加持仓明细后，这里会显示占比最大的几只。</p>;
  }
  const max = top[0]!.pctOfInvest || 1;
  // 集中度提示只针对个股 / 加密货币（宽基指数基金本身已分散）
  const risky = (t: (typeof top)[number]) => (t.type === 'stock' || t.type === 'crypto') && t.pctOfInvest >= 25;
  const flagged = top.find(risky);
  return (
    <div className="space-y-3">
      {top.map((t) => (
        <div key={t.key}>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-notion-text-secondary truncate" title={t.name}>{t.name}</span>
            <span className="font-numeric text-notion-text flex-shrink-0">{formatYen(t.value)}</span>
          </div>
          <div className="h-2 mt-1 flex items-center">
            <span
              className="h-full rounded-r-[4px]"
              style={{ width: `${Math.max(1.5, (t.pctOfInvest / max) * 100)}%`, background: risky(t) ? 'var(--c-warning)' : 'var(--c-invest)' }}
            />
          </div>
          <div className="text-[11px] font-numeric text-notion-text-muted mt-0.5 whitespace-nowrap">
            占投资 {t.pctOfInvest}% · 占总资产 {t.pctOfTotal}%
          </div>
        </div>
      ))}
      {flagged && (
        <p className="text-[11.5px] text-notion-text-secondary bg-[var(--c-bg-alt)] rounded-[var(--radius-md)] px-3 py-2">
          「{flagged.name}」一只就占投资的 {flagged.pctOfInvest}%，单一个股集中度较高（橙色 = 个股/加密货币超过 25%；宽基指数基金不算）。
        </p>
      )}
      <p className="text-[10.5px] text-notion-text-muted">同一代码在多个账户的持仓已合并计算。</p>
    </div>
  );
}
