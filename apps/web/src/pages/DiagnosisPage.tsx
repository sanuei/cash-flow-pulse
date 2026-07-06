import { useState, useEffect, type ReactNode } from 'react';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { PageTitle } from '../components/PageTitle';
import { apiGet, apiPost } from '../lib/api';

type Metric = {
  key: string;
  label: string;
  valueText: string;
  status: 'good' | 'warning' | 'bad';
  bar?: { pct: number; markPct?: number };
  criteria?: string;   // 旧记录可能没有
  verdict?: string;
  advice?: string;
  target?: string;     // 兼容旧记录
};
type HistoryItem = {
  id: string;
  cycle_id: string;
  model?: string;
  score: number | null;
  analysis: string;
  metrics?: Metric[];
  created_at: number;
};
type DiagnoseResponse = { id: string; cycle_id: string; score: number | null; analysis: string; metrics: Metric[]; generated_at: number; remaining: number | null };

const STATUS_COLOR: Record<Metric['status'], string> = {
  good: 'var(--c-success)',
  warning: '#E0A82E',
  bad: 'var(--c-warning)',
};

function parseApiError(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message.match(/API \d+:\s*(.*)/s);
    if (m && m[1]) {
      try {
        const parsed = JSON.parse(m[1]);
        if (parsed?.error) return parsed.error;
      } catch { /* 非 JSON */ }
      return m[1];
    }
    return e.message;
  }
  return 'AI 诊断失败，请稍后重试';
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const scoreColor = (s: number) => (s >= 70 ? 'var(--c-success)' : s >= 40 ? '#E0A82E' : 'var(--c-warning)');

export function DiagnosisPage() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    apiGet<{ items: HistoryItem[] }>('/ai/history')
      .then((d) => {
        setItems(d.items);
        setSelectedId(d.items[0]?.id ?? null);
      })
      .catch(() => setItems([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<DiagnoseResponse>('/ai/diagnose', {});
      const item: HistoryItem = {
        id: data.id,
        cycle_id: data.cycle_id,
        score: data.score,
        analysis: data.analysis,
        metrics: data.metrics,
        created_at: data.generated_at,
      };
      setItems((prev) => [item, ...(prev ?? [])]);
      setSelectedId(item.id);
      setRemaining(data.remaining);
    } catch (e) {
      setError(parseApiError(e));
    } finally {
      setLoading(false);
    }
  };

  const current = items?.find((i) => i.id === selectedId) ?? items?.[0] ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle icon="gauge" title="AI 财务诊断" subtitle="对照客观基准评估财务健康" />

      {/* 操作行 */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-notion-text-muted leading-relaxed">
          依据储蓄率、应急金覆盖月数、支出结构等客观基准分析本期财务。
          {remaining !== null && <span className="ml-1">今日剩余 {remaining} 次。</span>}
        </p>
        <button
          onClick={run}
          disabled={loading}
          className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-pill)] bg-[var(--c-accent)] text-[#0a0a0a] text-[13px] font-semibold hover:brightness-105 active:scale-95 transition-[transform,filter] disabled:opacity-60"
        >
          {loading ? (
            <>
              <Icon name="chevron-down" size={14} className="animate-spin" />
              <span>分析中…</span>
            </>
          ) : (
            <>
              <Icon name="trending-up" size={14} strokeWidth={2} />
              <span>{current ? '重新诊断' : '开始诊断'}</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="text-[13px] text-notion-warning bg-[var(--c-warning-soft)] rounded-[var(--radius-md)] px-3 py-2.5">
          {error}
        </div>
      )}

      {/* 历史加载中 */}
      {historyLoading && (
        <div className="flex items-center gap-2 text-[13px] text-notion-text-secondary py-8 justify-center">
          <Icon name="chevron-down" size={14} className="animate-spin" />
          <span>加载中…</span>
        </div>
      )}

      {/* 空态 */}
      {!historyLoading && !current && !loading && (
        <Card>
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <span className="w-12 h-12 rounded-full bg-[var(--c-accent-soft)] flex items-center justify-center">
              <Icon name="gauge" size={22} className="text-[var(--c-accent-text)]" strokeWidth={1.75} />
            </span>
            <div>
              <div className="text-[14px] font-semibold text-notion-text mb-1">还没有诊断记录</div>
              <p className="text-[12px] text-notion-text-muted leading-relaxed max-w-xs">
                点击「开始诊断」，AI 会给出 0–100 健康评分、各项指标对照与可执行建议。仅发送脱敏聚合数字，不含账户或机构名称。
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 最新 / 选中的诊断 */}
      {!historyLoading && current && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <Icon name="gauge" size={16} className="text-[var(--c-accent-text)]" strokeWidth={1.75} />
              <span>诊断结果</span>
            </div>
          }
          action={
            <span className="text-[11px] text-notion-text-muted">
              周期 {current.cycle_id} · {fmtTime(current.created_at)}
            </span>
          }
        >
          {current.metrics && current.metrics.length > 0 && (
            <MetricsChart metrics={current.metrics} score={current.score} />
          )}
          <Markdown text={current.analysis} />
          <div className="mt-4 pt-3 border-t border-[var(--c-border)] text-[11px] text-notion-text-muted leading-relaxed">
            AI 建议仅供参考，不构成投资或财务意见。
          </div>
        </Card>
      )}

      {/* 历史时间线 */}
      {!historyLoading && items && items.length > 1 && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <Icon name="chart" size={16} className="text-notion-text-secondary" strokeWidth={1.75} />
              <span>历史记录</span>
              <span className="badge-muted badge text-[10px] px-2 py-0.5">{items.length}</span>
            </div>
          }
          divided
        >
          <div className="space-y-1">
            {items.map((it) => {
              const active = it.id === current?.id;
              return (
                <button
                  key={it.id}
                  onClick={() => { setSelectedId(it.id); setError(null); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] text-left transition-colors ${
                    active ? 'bg-[var(--c-accent-soft)]' : 'hover:bg-[var(--c-bg-alt)]'
                  }`}
                >
                  {it.score !== null ? (
                    <span
                      className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-numeric font-semibold"
                      style={{ background: 'var(--c-bg-alt)', color: scoreColor(it.score) }}
                    >
                      {it.score}
                    </span>
                  ) : (
                    <span className="flex-shrink-0 w-9 h-9 rounded-full bg-[var(--c-bg-alt)] flex items-center justify-center">
                      <Icon name="gauge" size={14} className="text-notion-text-muted" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-notion-text font-medium">{fmtTime(it.created_at)}</div>
                    <div className="text-[11px] text-notion-text-muted">周期 {it.cycle_id}</div>
                  </div>
                  {active && <Icon name="chevron-right" size={14} className="text-[var(--c-accent-text)] flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── 健康度图表：总分环 + 体检式指标条 ──────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="flex-shrink-0">
      <circle cx="32" cy="32" r={R} fill="none" stroke="var(--c-bg-alt)" strokeWidth="6" />
      <circle
        cx="32" cy="32" r={R} fill="none" stroke={scoreColor(score)} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="34" textAnchor="middle" style={{ fontSize: '18px', fontWeight: 700, fill: 'var(--c-text)' }} className="font-numeric">
        {score}
      </text>
      <text x="32" y="45" textAnchor="middle" style={{ fontSize: '8px', fill: 'var(--c-text-muted)' }}>
        /100
      </text>
    </svg>
  );
}

function MetricsChart({ metrics, score }: { metrics: Metric[]; score: number | null }) {
  return (
    <div className="mb-4 pb-4 border-b border-[var(--c-border)]">
      {score !== null && (
        <div className="flex items-center gap-3 mb-4">
          <ScoreRing score={score} />
          <div>
            <div className="text-[13px] font-semibold text-notion-text">财务健康度</div>
            <div className="text-[11px] text-notion-text-muted mt-0.5">对照客观基准逐项评估</div>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {metrics.map((m) => {
          const color = STATUS_COLOR[m.status];
          return (
            <div key={m.key}>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-[12px] text-notion-text-secondary">{m.label}</span>
                <span className="ml-auto font-numeric font-semibold text-[13px]" style={{ color }}>
                  {m.valueText}
                </span>
              </div>
              {m.bar && (
                <div className="relative h-1.5 ml-4">
                  <div className="absolute inset-0 rounded-[var(--radius-pill)] bg-[var(--c-bg-alt)] overflow-hidden">
                    <div
                      className="h-full rounded-[var(--radius-pill)] transition-[width] duration-[var(--dur-deliberate)] ease-[var(--ease-out-expo)]"
                      style={{ width: `${m.bar.pct}%`, background: color }}
                    />
                  </div>
                  {m.bar.markPct != null && (
                    <div
                      className="absolute -top-0.5 -bottom-0.5 w-px bg-notion-text opacity-45"
                      style={{ left: `${m.bar.markPct}%` }}
                      title={m.target}
                    />
                  )}
                </div>
              )}
              <div className="mt-1 ml-4 space-y-0.5">
                {(m.criteria || m.target) && (
                  <div className="text-[10px] text-notion-text-muted">
                    {m.criteria ? <>标准&nbsp;&nbsp;{m.criteria}</> : m.target}
                  </div>
                )}
                {(m.verdict || m.advice) && (
                  <div className="text-[11px] leading-relaxed">
                    {m.verdict && (
                      <span className="font-semibold" style={{ color }}>{m.verdict}</span>
                    )}
                    {m.verdict && m.advice && <span className="text-notion-text-muted"> · </span>}
                    {m.advice && <span className="text-notion-text-secondary">{m.advice}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 轻量 Markdown 渲染 ──
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-notion-text">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{p}</span>;
  });
}

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  let listBuf: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuf.length === 0) return;
    const buf = listBuf;
    nodes.push(
      <ul key={`ul-${key++}`} className="space-y-1.5 my-2 pl-1">
        {buf.map((item, i) => (
          <li key={i} className="flex gap-2 text-[13px] text-notion-text-secondary leading-relaxed">
            <span className="text-[var(--c-accent-text)] flex-shrink-0 mt-0.5">•</span>
            <span>{renderInline(item, `li-${key}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
    listBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^#{2,4}\s+(.*)/);
    const bullet = line.match(/^[-*]\s+(.*)/);
    const ordered = line.match(/^\d+\.\s+(.*)/);

    if (heading) {
      flushList();
      nodes.push(
        <h4 key={`h-${key++}`} className="text-[13px] font-semibold text-notion-text tracking-tight-section mt-3.5 first:mt-0 mb-1.5">
          {renderInline(heading[1] ?? '', `h-${key}`)}
        </h4>,
      );
    } else if (bullet) {
      listBuf.push(bullet[1] ?? '');
    } else if (ordered) {
      listBuf.push(ordered[1] ?? '');
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      nodes.push(
        <p key={`p-${key++}`} className="text-[13px] text-notion-text-secondary leading-relaxed my-1.5">
          {renderInline(line, `p-${key}`)}
        </p>,
      );
    }
  }
  flushList();

  return <div>{nodes}</div>;
}
