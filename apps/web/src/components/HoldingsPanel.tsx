import { useEffect, useMemo, useRef, useState } from 'react';
import { formatYen, holdingValueJpy, holdingReturn, sumReturns, quoteKey, DEFAULT_ALLOCATION_TARGETS } from '@cfp/shared';
import type { Holding, HoldingKind, Quote } from '@cfp/shared';
import { useStore } from '../lib/store';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api';
import { Field, Segmented } from './FormKit';
import { Icon } from './Icon';
import { ReturnText } from './ReturnText';

/**
 * 某个「其他资产」（证券账户）下的持仓：按行情自动估值。
 * 改动即时保存到服务器（不走外层表单的「保存」），保存后重载持仓与资产价值。
 */

const KIND_OPTIONS: { value: HoldingKind; label: string }[] = [
  { value: 'market', label: '股票/加密' },
  { value: 'jp_fund', label: '日本投信' },
  { value: 'cn_fund', label: '中国基金' },
  { value: 'manual', label: '现金/其他' },
];

const KIND_META: Record<HoldingKind, { qtyLabel: string; symbolLabel: string; placeholder: string; hint: string }> = {
  market: {
    qtyLabel: '持有股数（可填小数）',
    symbolLabel: '代码或名称',
    placeholder: '如 Tesla / TSLA / 8306.T / BTC-JPY',
    hint: '美股填代码（TSLA），日股加 .T（三菱UFJ = 8306.T），比特币填 BTC-JPY。按 Yahoo Finance 行情，每小时更新。',
  },
  jp_fund: {
    qtyLabel: '保有口数',
    symbolLabel: '協会コード（8 位）',
    placeholder: '如 03311187',
    hint: '在 Yahoo!ファイナンス 搜基金名，页面标题【】里的 8 位代码就是協会コード。如 eMAXIS Slim米国株式(S&P500) = 03311187。按每 1 万口基準価額计算，每天更新。',
  },
  cn_fund: {
    qtyLabel: '持有份额',
    symbolLabel: '基金名称或 6 位代码',
    placeholder: '如 天弘纳斯达克100 / 018043',
    hint: '支付宝里显示的是金额，份额在基金详情页「持有份额」。按天天基金单位净值（人民币）折算日元，每天更新。',
  },
  manual: {
    qtyLabel: '金额（日元）',
    symbolLabel: '',
    placeholder: '',
    hint: '证券账户里的现金、不想跟踪行情的小额持仓等，直接填日元金额。',
  },
};

type SearchResult = { symbol: string; name: string; exchange: string | null; type: string | null };
type Lookup = { symbol: string; name: string | null; price: number; currency: string; priceDate: string | null };

function priceText(kind: HoldingKind, q?: Pick<Quote, 'price' | 'currency' | 'price_date'>) {
  if (!q || q.price == null) return '暂无行情';
  const date = q.price_date ? ` · ${q.price_date.slice(5).replace('-', '/')}` : '';
  if (kind === 'jp_fund') return `基準価額 ${q.price.toLocaleString('en-US')}円${date}`;
  if (kind === 'cn_fund') return `净值 ${q.price} 元${date}`;
  const cur = q.currency === 'JPY' ? '¥' : q.currency === 'USD' ? '$' : `${q.currency} `;
  return `${cur}${q.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}${date}`;
}

const fmtQty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 });

export function HoldingsPanel({ assetId }: { assetId: string }) {
  const holdingsAll = useStore((s) => s.holdings);
  const quotes = useStore((s) => s.quotes);
  const fx = useStore((s) => s.fx);
  const loadHoldings = useStore((s) => s.loadHoldings);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holdings = holdingsAll.filter((h) => h.asset_id === assetId);
  const quoteMap = useMemo(() => new Map(quotes.map((q) => [quoteKey(q.kind, q.symbol), q])), [quotes]);
  const rows = holdings
    .map((h) => {
      const q = quoteMap.get(quoteKey(h.kind, h.symbol));
      return { h, q, value: holdingValueJpy(h, q, fx) };
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const total = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  const ret = sumReturns(holdings, quoteMap, fx);
  const lastFetched = Math.max(0, ...rows.map((r) => r.q?.fetched_at ?? 0));

  useEffect(() => { loadHoldings().catch(() => {}); }, [loadHoldings]);

  const reload = async () => { await Promise.all([loadHoldings(), loadDashboard()]); };

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try { await apiPost('/holdings/refresh', {}); await reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setRefreshing(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-notion-text">持仓 · 自动估值</div>
          <div className="text-[11px] text-notion-text-muted">
            {holdings.length > 0
              ? <>合计 <span className="font-numeric text-notion-text-secondary">{formatYen(Math.round(total))}</span>
                  {lastFetched > 0 && <> · 行情更新于 {new Date(lastFetched).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}</>
              : '添加持仓后，这个资产的价值按行情自动计算（股票每小时、基金每天更新）'}
          </div>
          {ret.count > 0 && ret.missing === 0 && (
            <div className="text-[11.5px] text-notion-text-muted mt-0.5">持仓收益 <ReturnText gain={ret.gain} pct={ret.pct} /></div>
          )}
          {ret.missing > 0 && (
            <div className="text-[11.5px] text-notion-text-muted mt-0.5">
              合计收益：还差 {ret.missing} 个持仓的成本（点持仓上的「填成本」）
            </div>
          )}
        </div>
        {holdings.some((h) => h.kind !== 'manual') && (
          <button type="button" onClick={refresh} disabled={refreshing} className="btn-ghost text-[12px] inline-flex items-center gap-1 flex-shrink-0">
            <Icon name="loading" size={12} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? '刷新中' : '刷新行情'}</span>
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="divide-y divide-[var(--c-border)] rounded-[var(--radius-md)] border border-[var(--c-border)]">
          {rows.map(({ h, q, value }) => (
            <HoldingRow key={h.id} h={h} q={q} value={value} fx={fx} onChanged={reload} onError={setError} />
          ))}
        </ul>
      )}

      {error && <div className="text-[12px] text-notion-warning">{error}</div>}

      {adding ? (
        <AddHolding assetId={assetId} onDone={async () => { setAdding(false); await reload(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-ghost text-[12px] inline-flex items-center gap-1 text-[var(--c-accent-text)]">
          <Icon name="add" size={13} /> 添加持仓
        </button>
      )}
    </div>
  );
}

function HoldingRow({ h, q, value, fx, onChanged, onError }: {
  h: Holding; q?: Quote; value: number | null; fx: Record<string, number>; onChanged: () => Promise<void>; onError: (m: string | null) => void;
}) {
  const ret = holdingReturn(h, q, fx);
  const targets = useStore((s) => s.config?.allocation_targets) ?? DEFAULT_ALLOCATION_TARGETS;
  const setBucket = async (bucket: string) => {
    try { await apiPut(`/holdings/${h.id}`, { bucket: bucket || null }); await onChanged(); }
    catch (e) { onError((e as Error).message); }
  };
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(h.quantity));
  const [cost, setCost] = useState<CostState>(() => initCost(h));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = Number(qty.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) { onError('数量无效'); return; }
    const c = h.kind === 'manual' ? null : resolveCost(cost, h.kind, n, q?.currency ?? 'JPY', makeValueIn(h.kind, n, q, fx));
    if (c === 'invalid') { onError('成本无效'); return; }
    setBusy(true);
    try {
      await apiPut(`/holdings/${h.id}`, {
        quantity: n,
        ...(h.kind === 'manual' ? {} : { cost_basis: c?.total ?? null, cost_currency: c?.currency ?? null }),
      });
      setEditing(false); onError(null); await onChanged();
    }
    catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(`删除持仓「${h.name}」？`)) return;
    setBusy(true);
    try { await apiDelete(`/holdings/${h.id}`); await onChanged(); }
    catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  };

  // 加密货币（BTC-JPY 等）按「个」不写单位；股票写「股」
  const isCrypto = h.kind === 'market' && /-(JPY|USD|EUR)$/.test(h.symbol);
  const unit = h.kind === 'jp_fund' ? '口' : h.kind === 'cn_fund' ? '份' : h.kind === 'manual' || isCrypto ? '' : '股';
  return (
    <li className="px-3 py-2.5 text-[13px]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-notion-text truncate" title={h.name}>{h.name}</div>
          <div className="text-[11px] text-notion-text-muted truncate">
            {h.kind === 'manual' ? '手动金额' : <>{h.symbol} · {fmtQty(h.quantity)}{unit} · {priceText(h.kind, q)}</>}
          </div>
          <select
            className="mt-1 text-[11px] bg-transparent border border-[var(--c-border)] rounded-[var(--radius-sm)] px-1.5 py-0.5 text-notion-text-secondary max-w-full"
            value={h.bucket ?? ''}
            onChange={(e) => setBucket(e.target.value)}
            aria-label="配置类别"
          >
            <option value="">配置类别：未分类</option>
            {targets.map((t) => <option key={t.key} value={t.key}>配置类别：{t.label}</option>)}
          </select>
          {q?.error && (
            <div className="text-[11px] text-notion-warning truncate" title={q.error}>行情更新失败（显示上次价格）：{q.error}</div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-numeric text-notion-text">{value === null ? '—' : formatYen(Math.round(value))}</div>
          {ret && <div className="text-[11px]"><ReturnText gain={ret.gain} pct={ret.pct} /></div>}
          {!editing && (
            <div className="flex gap-2 justify-end text-[11px] mt-0.5">
              <button type="button" className="text-[var(--c-accent-text)]" onClick={() => { setCost(initCost(h)); setEditing(true); }}>
                {h.kind === 'manual' ? '改金额' : h.cost_basis == null ? '改数量 / 填成本' : '改数量 / 成本'}
              </button>
              <button type="button" className="text-notion-text-muted" onClick={remove} disabled={busy}>删除</button>
            </div>
          )}
        </div>
      </div>
      {editing && (
        <div className="mt-2 space-y-2">
          <Field label={KIND_META[h.kind].qtyLabel}>
            <input
              className="input font-numeric" inputMode="decimal" value={qty} autoFocus
              onChange={(e) => setQty(e.target.value)} onFocus={(e) => e.currentTarget.select()}
            />
          </Field>
          {h.kind !== 'manual' && (
            <CostEditor
              kind={h.kind} quoteCurrency={q?.currency ?? 'JPY'} quantity={Number(qty.replace(/,/g, '')) || 0}
              valueIn={makeValueIn(h.kind, Number(qty.replace(/,/g, '')) || 0, q, fx)} value={cost} onChange={setCost}
            />
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost text-[12px]" onClick={() => setEditing(false)}>取消</button>
            <button type="button" className="btn-primary text-[12px]" onClick={save} disabled={busy}>保存</button>
          </div>
        </div>
      )}
    </li>
  );
}

function AddHolding({ assetId, onDone, onCancel }: { assetId: string; onDone: () => Promise<void>; onCancel: () => void }) {
  const fx = useStore((s) => s.fx);
  const [kind, setKind] = useState<HoldingKind>('market');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState<Lookup | null>(null);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState<CostState>({ amount: '', mode: 'total', currency: 'JPY' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = KIND_META[kind];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setTerm(''); setResults([]); setPicked(null); setError(null); }, [kind]);

  // 股票 / 中国基金：输入停顿 400ms 后搜索
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (picked || kind === 'jp_fund' || kind === 'manual' || term.trim().length < 1) { setResults([]); return; }
    timer.current = setTimeout(() => {
      apiGet<{ results: SearchResult[] }>(`/holdings/search?kind=${kind}&q=${encodeURIComponent(term.trim())}`)
        .then((d) => setResults(d.results))
        .catch(() => setResults([]));
    }, 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [term, kind, picked]);

  const lookup = async (symbol: string) => {
    setBusy(true);
    setError(null);
    try {
      const d = await apiGet<Lookup>(`/holdings/lookup?kind=${kind}&symbol=${encodeURIComponent(symbol)}`);
      setPicked(d);
      setResults([]);
    } catch (e) {
      setError(parseErr(e));
    } finally {
      setBusy(false);
    }
  };

  const quantity = Number(qty.replace(/,/g, ''));
  const preview = picked && quantity > 0
    ? holdingValueJpy({ kind, quantity }, { price: picked.price, currency: picked.currency }, fx)
    : null;

  const submit = async () => {
    setError(null);
    if (!(quantity >= 0) || qty.trim() === '') { setError(`请填写${meta.qtyLabel}`); return; }
    if (kind === 'manual' ? !name.trim() : !picked) { setError(kind === 'manual' ? '请填写名称' : '请先选择或查询一个代码'); return; }
    const c = kind === 'manual' ? null : resolveCost(cost, kind, quantity, picked?.currency ?? 'JPY', makeValueIn(kind, quantity, picked ?? undefined, fx));
    if (c === 'invalid') { setError('成本无效'); return; }
    setBusy(true);
    try {
      await apiPost('/holdings', {
        asset_id: assetId, kind, quantity,
        symbol: kind === 'manual' ? '' : picked!.symbol,
        name: kind === 'manual' ? name.trim() : undefined,
        cost_basis: c?.total ?? null,
        cost_currency: c?.currency ?? null,
      });
      await onDone();
    } catch (e) {
      setError(parseErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--c-border)] p-3 space-y-3">
      <Segmented options={KIND_OPTIONS} value={kind} onChange={setKind} />

      {kind === 'manual' ? (
        <Field label="名称">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="如 账户现金" />
        </Field>
      ) : picked ? (
        <div className="flex items-start justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--c-bg-alt)] px-3 py-2">
          <div className="min-w-0">
            <div className="text-[13px] text-notion-text truncate">{picked.name ?? picked.symbol}</div>
            <div className="text-[11px] text-notion-text-muted">{picked.symbol} · {priceText(kind, { price: picked.price, currency: picked.currency, price_date: picked.priceDate })}</div>
          </div>
          <button type="button" className="text-[11px] text-[var(--c-accent-text)] flex-shrink-0" onClick={() => { setPicked(null); setTerm(''); }}>换一个</button>
        </div>
      ) : (
        <Field label={meta.symbolLabel}>
          <div className="flex gap-2">
            <input
              className="input flex-1" value={term} placeholder={meta.placeholder}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (term.trim()) lookup(term.trim()); } }}
            />
            <button type="button" className="btn-ghost text-[12px]" disabled={busy || !term.trim()} onClick={() => lookup(term.trim())}>
              {busy ? '查询中' : '查询'}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="mt-1 max-h-56 overflow-auto rounded-[var(--radius-sm)] border border-[var(--c-border)] divide-y divide-[var(--c-border)]">
              {results.map((r) => (
                <li key={r.symbol}>
                  <button type="button" className="w-full text-left px-3 py-2 hover:bg-[var(--c-bg-alt)]" onClick={() => lookup(r.symbol)}>
                    <div className="text-[13px] text-notion-text truncate">{r.name}</div>
                    <div className="text-[11px] text-notion-text-muted">{r.symbol}{r.exchange ? ` · ${r.exchange}` : ''}{r.type ? ` · ${r.type}` : ''}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>
      )}

      <Field label={meta.qtyLabel}>
        <input className="input font-numeric" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
      </Field>

      {kind !== 'manual' && picked && (
        <CostEditor
          kind={kind} quoteCurrency={picked.currency} quantity={quantity || 0}
          valueIn={makeValueIn(kind, quantity || 0, picked, fx)} value={cost} onChange={setCost}
        />
      )}

      <p className="text-[11px] text-notion-text-muted leading-relaxed">{meta.hint}</p>
      {preview !== null && (
        <div className="text-[12px] text-notion-text-secondary">按当前行情约 <span className="font-numeric text-notion-text">{formatYen(Math.round(preview))}</span></div>
      )}
      {error && <div className="text-[12px] text-notion-warning">{error}</div>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost text-[12px]" onClick={onCancel}>取消</button>
        <button type="button" className="btn-primary text-[12px]" onClick={submit} disabled={busy}>添加</button>
      </div>
    </div>
  );
}

// ── 成本：总投入 / 均价 / 收益率 / 收益金额（后两种按当前市值反推）；币种 = 日元 或 标的币种 ─────
type CostMode = 'total' | 'avg' | 'pct' | 'gain';
type CostState = { amount: string; mode: CostMode; currency: string };
/** 当前市值：JPY → 日元市值；外币 → 该币种市值（按当前行情） */
type ValueIn = (currency: string) => number | null;

function initCost(h: Holding): CostState {
  return { amount: h.cost_basis != null ? String(Math.round(h.cost_basis * 100) / 100) : '', mode: 'total', currency: h.cost_currency || 'JPY' };
}

function makeValueIn(kind: HoldingKind, quantity: number, quote: { price: number | null; currency: string | null } | undefined, fx: Record<string, number>): ValueIn {
  return (cur) => {
    if (!quote || quote.price == null || !(quantity > 0)) return null;
    if (cur === 'JPY') return holdingValueJpy({ kind, quantity }, { price: quote.price, currency: quote.currency }, fx);
    if ((quote.currency || '').toUpperCase() !== cur) return null;
    return (kind === 'jp_fund' ? quantity / 10000 : quantity) * quote.price;
  };
}

/** 空 → null（不填成本）；非法 → 'invalid' */
function resolveCost(
  c: CostState, kind: HoldingKind, quantity: number, quoteCurrency: string, valueIn: ValueIn,
): { total: number; currency: string } | null | 'invalid' {
  const raw = c.amount.replace(/[,%％+＋]/g, '').replace(/^[−–]/, '-').trim();
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'invalid';
  // 只允许日元或标的本身的币种（换了标的后残留的旧币种按日元处理）
  const currency = quoteCurrency && quoteCurrency !== 'JPY' && c.currency === quoteCurrency ? quoteCurrency : 'JPY';
  const units = kind === 'jp_fund' ? quantity / 10000 : quantity;  // 投信的均价是每 1 万口
  let total: number;
  if (c.mode === 'total') total = n;
  else if (c.mode === 'avg') total = n * units;
  else {
    const value = valueIn(currency);
    if (value == null) return 'invalid';
    // 收益率：成本 = 市值 ÷ (1 + 收益率)；收益金额：成本 = 市值 − 收益
    total = c.mode === 'pct' ? (n <= -100 ? NaN : value / (1 + n / 100)) : value - n;
  }
  if (!Number.isFinite(total) || total <= 0) return 'invalid';
  return { total: Math.round(total * 10000) / 10000, currency };
}

const MODE_OPTIONS: { value: CostMode; label: string }[] = [
  { value: 'total', label: '总投入' },
  { value: 'avg', label: '均价' },
  { value: 'pct', label: '收益率' },
  { value: 'gain', label: '收益额' },
];

function CostEditor({ kind, quoteCurrency, quantity, valueIn, value, onChange }: {
  kind: HoldingKind; quoteCurrency: string; quantity: number; valueIn: ValueIn; value: CostState; onChange: (v: CostState) => void;
}) {
  const foreign = quoteCurrency && quoteCurrency !== 'JPY' ? quoteCurrency : null;
  const cur = foreign && value.currency === foreign ? foreign : 'JPY';
  const curLabel = cur === 'JPY' ? '日元' : cur;
  const placeholder = {
    total: `买入时一共花了多少（${curLabel}）`,
    avg: kind === 'jp_fund' ? '平均取得単価（每 1 万口）' : kind === 'cn_fund' ? '持仓成本价（每份）' : `均价（每股，${curLabel}）`,
    pct: '券商显示的收益率，如 70.76 或 -19.98',
    gain: `券商显示的收益金额（${curLabel}），亏损填负数`,
  }[value.mode];
  const resolved = value.amount.trim() ? resolveCost(value, kind, quantity, quoteCurrency, valueIn) : null;
  const fmt = (v: number) => (cur === 'JPY' ? formatYen(Math.round(v)) : `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur}`);
  const now = valueIn(cur);

  return (
    <Field label="成本（可选，用于计算收益率）">
      <div className="space-y-2 mb-1.5">
        <Segmented options={MODE_OPTIONS} value={value.mode} onChange={(m) => onChange({ ...value, mode: m })} />
        {foreign && (
          <Segmented
            options={[{ value: 'JPY', label: '按日元' }, { value: foreign, label: `按 ${foreign}` }]}
            value={cur} onChange={(c) => onChange({ ...value, currency: c })}
          />
        )}
      </div>
      <input
        className="input font-numeric" inputMode="decimal" value={value.amount} placeholder={placeholder}
        onChange={(e) => onChange({ ...value, amount: e.target.value })}
      />
      {(value.mode === 'pct' || value.mode === 'gain' || value.mode === 'avg') && resolved && resolved !== 'invalid' && (
        <p className="text-[12px] text-notion-text-secondary mt-1">
          → 成本 <span className="font-numeric text-notion-text">{fmt(resolved.total)}</span>
          {now != null && <span className="text-notion-text-muted">（当前市值 {fmt(now)}）</span>}
        </p>
      )}
      {resolved === 'invalid' && <p className="text-[12px] text-notion-warning mt-1">{now == null && (value.mode === 'pct' || value.mode === 'gain') ? '暂无行情，不能反推成本' : '数值无效'}</p>}
      <p className="text-[11px] text-notion-text-muted mt-1 leading-relaxed">
        {(value.mode === 'pct' || value.mode === 'gain') && '按当前市值反推成本：最好照着券商 App 此刻显示的数字填（行情时点不同会有 1～2% 误差）。'}
        {cur === 'JPY'
          ? '日元：收益含汇率变化，和 PayPay 证券等日本券商的「評価損益」一致。'
          : `${cur}：收益率按 ${cur} 计算（不含汇率变化），和 moomoo 等外币账户一致。`}
      </p>
    </Field>
  );
}

function parseErr(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  const m = msg.match(/API \d+:\s*(.*)/s);
  if (m && m[1]) {
    try { const p = JSON.parse(m[1]); if (p?.error) return p.error; } catch { /* 非 JSON */ }
    return m[1];
  }
  return msg;
}
