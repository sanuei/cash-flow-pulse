/**
 * 财富模拟器 — 首页「财务自由」卡的详细版
 *
 * 结构（先给答案，再给细节）：
 *   左：参数面板（5 个核心滑块常驻；高级参数折叠；每项都能「恢复为我的数据」）
 *   右：① 答案区（三句话 + 关键数字 + 与「你现在的路线」对比）
 *       ② 资产轨迹（单线 / 三情景，今天购买力 / 名义）
 *       ③ 反推目标（想在 X 岁自由 → 每月要投多少 / 最多能花多少）
 *       ④ 本金 vs 复利收益
 *       ⑤ 逐年明细表（可导出 CSV）
 *
 * 参数存服务器 user_config.simulator_settings，只存改过的字段；没改的跟随真实数据自动更新。
 * 「你现在的路线」= 不带任何覆盖的基准，也就是首页财务自由卡看到的那条路线。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  simulate, simulateScenarios, solveMonthlyInvest, solveRetireSpend, computeLevers, applySimSettings, formatYen,
  type SimEvent, type SimInput, type SimResult, type SimulatorSettings,
} from '@cfp/shared';
import { useStore } from '../lib/store';
import { useSimBaseline, withSettings, yenCompact, formatMonths, yearAfterMonths, currentAge, type SimBaseline } from '../lib/simulator';
import { PageTitle } from '../components/PageTitle';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { MoneyInput } from '../components/MoneyInput';
import { Collapsible } from '../components/FormKit';
import { LoadingState } from '../components/States';
import { AssetTrajectoryChart, PrincipalGainsChart, type TrajectoryMode } from '../components/simulator/SimCharts';
import { SimTable } from '../components/simulator/SimTable';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type Key = keyof SimulatorSettings;

export default function SimulatorPage() {
  const config = useStore((s) => s.config);
  const saveConfig = useStore((s) => s.saveSimulatorConfig);
  const baseline = useSimBaseline();

  // 用户改过的参数；只在首次进入时从服务器读（之后以本地为准，自动保存）
  const [overrides, setOverrides] = useState<SimulatorSettings>(() => config?.simulator_settings ?? {});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(!!config);
  useEffect(() => {
    if (!loadedRef.current && config) {
      loadedRef.current = true;
      setOverrides(config.simulator_settings ?? {});
    }
  }, [config]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const persist = (next: SimulatorSettings) => {
    setOverrides(next);
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveConfig({ simulator_settings: Object.keys(next).length ? next : null })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 800);
  };
  const set = <K extends Key>(k: K, v: SimulatorSettings[K]) => persist({ ...overrides, [k]: v });
  const reset = (k: Key) => {
    const next = { ...overrides };
    delete next[k];
    persist(next);
  };
  const resetAll = () => persist({});

  if (!config || !baseline) return <LoadingState />;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle
        icon="trending-up"
        title="财富模拟"
        subtitle="用你的真实数据推演一生的资产 · 金额默认按今天的购买力"
      />
      {baseline.birthYear === null ? (
        <BirthYearPrompt onSave={(y) => saveConfig({ birth_year: y })} />
      ) : (
        <SimulatorBody
          baseline={baseline}
          overrides={overrides}
          set={set}
          reset={reset}
          resetAll={resetAll}
          saveState={saveState}
          onBirthYear={(y) => saveConfig({ birth_year: y })}
        />
      )}
      <p className="text-[11px] text-notion-text-muted leading-relaxed">
        模拟结果只是按固定假设的推算，不构成投资建议。实际收益每年都会波动，越远的年份误差越大。
      </p>
    </div>
  );
}

// ── 主体 ───────────────────────────────────────────────────────

function SimulatorBody({
  baseline, overrides, set, reset, resetAll, saveState, onBirthYear,
}: {
  baseline: SimBaseline;
  overrides: SimulatorSettings;
  set: <K extends Key>(k: K, v: SimulatorSettings[K]) => void;
  reset: (k: Key) => void;
  resetAll: () => void;
  saveState: SaveState;
  onBirthYear: (y: number) => Promise<void>;
}) {
  const [mode, setMode] = useState<TrajectoryMode>('single');
  const [nominal, setNominal] = useState(false);

  const input = useMemo(() => withSettings(baseline, overrides), [baseline, overrides]);
  const scen = useMemo(() => simulateScenarios(input), [input]);
  const result = scen.base;
  const baseResult = useMemo(() => simulate(baseline.input), [baseline]);
  const levers = useMemo(() => computeLevers(input), [input]);
  const hasOverrides = Object.keys(overrides).length > 0;
  const differs = hasOverrides && !sameTrajectory(result, baseResult);

  /** 只改这一项（其余保持你现在的数据）时，财务自由提前/推迟多少个月 */
  const deltaOf = (k: Key): number | null => {
    if (overrides[k] === undefined) return null;
    const alt = simulate(applySimSettings(baseline.input, { [k]: overrides[k] }));
    return monthsDiff(baseResult.fireMonth, alt.fireMonth);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] items-start">
      {/* 左：参数面板（手机端排在结果后面） */}
      <aside className="order-2 lg:order-1 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto card p-5 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-notion-text flex items-center gap-2">
            <Icon name="settings" size={15} className="text-notion-text-secondary" />
            参数
          </h2>
          <div className="flex items-center gap-2">
            <SaveIndicator state={saveState} />
            {hasOverrides && (
              <button onClick={resetAll} className="btn-ghost text-[12px]">全部恢复</button>
            )}
          </div>
        </div>

        <CoreParams baseline={baseline} input={input} overrides={overrides} set={set} reset={reset} deltaOf={deltaOf} />

        <AdvancedParams baseline={baseline} input={input} overrides={overrides} set={set} reset={reset} onBirthYear={onBirthYear} />
      </aside>

      {/* 右：结果 */}
      <div className="order-1 lg:order-2 space-y-6 min-w-0">
        <AnswerCard input={input} result={result} baseResult={baseResult} differs={differs} levers={levers} periods={baseline.periods} />

        <Card title="资产轨迹">
          <div className="flex flex-wrap items-center gap-1 -mt-1 mb-3">
            <Pills options={[{ v: 'single', l: '单线' }, { v: 'scenarios', l: '三情景' }]} value={mode} onChange={setMode} />
            <span className="w-px h-4 bg-[var(--c-border)] mx-1" aria-hidden="true" />
            <Pills options={[{ v: false, l: '今天购买力' }, { v: true, l: '名义金额' }]} value={nominal} onChange={setNominal} />
          </div>
          <AssetTrajectoryChart
            input={input}
            result={result}
            baseline={baseResult}
            scenarios={scen}
            mode={mode}
            nominal={nominal}
            showBaseline={differs}
            events={input.events}
          />
          {mode === 'scenarios' && (
            <ScenarioSummary scen={scen} />
          )}
        </Card>

        <GoalSeekCard input={input} set={set} />

        <Card title="本金 vs 复利收益">
          <PrincipalGainsChart input={input} result={result} nominal={nominal} />
        </Card>

        <Card title="逐年明细">
          <SimTable input={input} result={result} nominal={nominal} />
        </Card>
      </div>
    </div>
  );
}

function sameTrajectory(a: SimResult, b: SimResult): boolean {
  if (a.rows.length !== b.rows.length) return false;
  return a.rows.every((r, i) => Math.abs(r.endTotal - b.rows[i]!.endTotal) < 1);
}

/** 正数 = 提前；Infinity = 从达不到变成能达到；-Infinity = 反过来 */
function monthsDiff(base: number | null, alt: number | null): number {
  if (base === null && alt === null) return 0;
  if (base === null) return Infinity;
  if (alt === null) return -Infinity;
  return base - alt;
}

function deltaText(d: number): { text: string; good: boolean } | null {
  if (d === 0) return null;
  if (d === Infinity) return { text: '变得可以达成', good: true };
  if (d === -Infinity) return { text: '变得达不到', good: false };
  return { text: `${d > 0 ? '提前' : '推迟'} ${formatMonths(Math.abs(d))}`, good: d > 0 };
}

// ── 答案区 ─────────────────────────────────────────────────────

function AnswerCard({
  input, result, baseResult, differs, levers, periods,
}: {
  input: SimInput;
  result: SimResult;
  baseResult: SimResult;
  differs: boolean;
  levers: ReturnType<typeof computeLevers>;
  periods: number;
}) {
  const subject = differs ? '按这个方案' : periods > 1 ? `按近 ${periods} 期的节奏` : '按现在的节奏';
  const current = input.cash + input.invested;
  const progress = result.target > 0 ? Math.min(100, (current / result.target) * 100) : 0;
  const lever = levers.find((l) => l.monthsEarlier > 0);
  const vsBase = differs ? deltaText(monthsDiff(baseResult.fireMonth, result.fireMonth)) : null;
  const retireAge = result.retireAge;

  if (result.target <= 0) {
    return (
      <Card>
        <p className="text-[14px] text-notion-text-secondary leading-relaxed">
          还没有支出数据，算不出财务自由目标。在左侧填「退休后月支出」，或先录入信用卡、账单、订阅等消费。
        </p>
      </Card>
    );
  }

  return (
    <Card className="!p-6">
      <div className="space-y-2.5 text-[15px] sm:text-[16px] leading-relaxed text-notion-text">
        <p>
          {result.fireMonth === 0 ? (
            <>你的资产<b className="text-[var(--c-accent-text)]">已经达到</b>财务自由目标。</>
          ) : result.fireMonth !== null ? (
            <>
              {subject}，你会在{' '}
              <b className="text-[var(--c-accent-text)] font-semibold">
                {Math.floor(result.fireAge!)} 岁（{yearAfterMonths(result.fireMonth)} 年）
              </b>{' '}
              实现财务自由，还需 {formatMonths(result.fireMonth)}。
            </>
          ) : (
            <>
              {subject}，到 {Math.round(input.lifeExpectancy)} 岁也<b className="text-notion-warning">达不到</b>财务自由目标。
            </>
          )}
          {vsBase && (
            <span className={`badge ${vsBase.good ? 'badge-success' : 'badge-warning'} ml-2 align-middle`}>
              比现在的路线{vsBase.text}
            </span>
          )}
        </p>
        {retireAge !== null && (
          <p className="text-notion-text-secondary">
            {Math.floor(retireAge)} 岁停止工作后，
            {result.depletedAge !== null ? (
              <>资产会在 <b className="text-notion-warning">{Math.floor(result.depletedAge)} 岁耗尽</b>，比预期寿命早 {Math.max(0, Math.round(input.lifeExpectancy - result.depletedAge))} 年。</>
            ) : (
              <>资产能撑到 {Math.round(input.lifeExpectancy)} 岁，届时还剩 <b className="text-notion-text">{yenCompact(result.endAssets)}</b>。</>
            )}
          </p>
        )}
        {lever && result.fireMonth !== 0 && (
          <p className="text-notion-text-secondary">
            最有效的杠杆：<b className="text-notion-text">{lever.label}</b>，
            {lever.monthsEarlier === Infinity ? '能让目标变得可以达成' : `可提前 ${formatMonths(lever.monthsEarlier)}`}。
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4 mt-5 pt-5 border-t border-[var(--c-border)]">
        <Kpi label="财务自由目标" value={yenCompact(result.target)} hint={`年支出 ${yenCompact(input.retireSpendMonthly * 12)} ÷ ${input.withdrawalRatePct}%`} />
        <Kpi label="当前资产" value={yenCompact(current)} hint={`完成 ${Math.round(progress * 10) / 10}%`} />
        <Kpi label="资产峰值" value={yenCompact(result.peak)} hint={`${Math.floor(result.peakAge)} 岁`} />
        <Kpi
          label={result.depletedAge !== null ? '资产耗尽' : `${Math.round(input.lifeExpectancy)} 岁时剩余`}
          value={result.depletedAge !== null ? `${Math.floor(result.depletedAge)} 岁` : yenCompact(result.endAssets)}
          hint={result.depletedAge !== null ? '之后支出没有着落' : '按今天的购买力'}
          warn={result.depletedAge !== null}
        />
      </dl>
      {/* 进度条 */}
      <div className="h-1.5 rounded-[var(--radius-pill)] bg-[var(--c-bg-alt)] overflow-hidden mt-4" aria-hidden="true">
        <div className="h-full rounded-[var(--radius-pill)] bg-[var(--c-accent)]" style={{ width: `${progress}%` }} />
      </div>
    </Card>
  );
}

function Kpi({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-notion-text-secondary">{label}</dt>
      <dd className={`font-numeric font-semibold tabular-nums text-[20px] leading-tight mt-0.5 ${warn ? 'text-notion-warning' : 'text-notion-text'}`}>{value}</dd>
      <dd className="text-[11px] text-notion-text-muted truncate mt-0.5">{hint}</dd>
    </div>
  );
}

function ScenarioSummary({ scen }: { scen: ReturnType<typeof simulateScenarios> }) {
  const cell = (label: string, r: SimResult) => (
    <div className="min-w-0">
      <div className="text-[11px] text-notion-text-muted">{label}</div>
      <div className="font-numeric font-semibold text-[14px] text-notion-text">
        {r.fireAge === null ? '达不到' : r.fireMonth === 0 ? '已达成' : `${Math.floor(r.fireAge)} 岁自由`}
      </div>
      <div className="text-[11px] text-notion-text-muted">
        {r.depletedAge !== null ? `${Math.floor(r.depletedAge)} 岁耗尽` : `最终 ${yenCompact(r.endAssets)}`}
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[var(--c-border)]">
      {cell('悲观（收益 −2%）', scen.pessimistic)}
      {cell('基准', scen.base)}
      {cell('乐观（收益 +2%）', scen.optimistic)}
    </div>
  );
}

// ── 反推目标 ───────────────────────────────────────────────────

function GoalSeekCard({ input, set }: { input: SimInput; set: <K extends Key>(k: K, v: SimulatorSettings[K]) => void }) {
  const minAge = Math.ceil(input.startAge) + 1;
  const [age, setAge] = useState(() => Math.max(minAge, Math.ceil(input.startAge) + 15));
  const target = Math.max(minAge, Math.min(100, age));
  const needInvest = useMemo(() => solveMonthlyInvest(input, target), [input, target]);
  const maxSpend = useMemo(() => solveRetireSpend(input, target), [input, target]);
  const surplus = input.monthlyIncome - input.monthlyLivingCost;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Icon name="pin" size={15} className="text-[var(--c-accent-text)]" />
          反推目标
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-[14px] text-notion-text">
        <span>我想在</span>
        <div className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--c-border-strong)] overflow-hidden">
          <button type="button" className="px-2.5 py-1.5 hover:bg-[var(--c-bg-alt)] text-notion-text-secondary" onClick={() => setAge(target - 1)} aria-label="减一岁">−</button>
          <input
            type="number" inputMode="numeric" min={minAge} max={100}
            className="w-14 text-center font-numeric font-semibold bg-transparent outline-none py-1.5"
            value={age}
            onChange={(e) => setAge(Number(e.target.value) || minAge)}
            onBlur={() => setAge(target)}
            aria-label="目标年龄"
          />
          <button type="button" className="px-2.5 py-1.5 hover:bg-[var(--c-bg-alt)] text-notion-text-secondary" onClick={() => setAge(target + 1)} aria-label="加一岁">+</button>
        </div>
        <span>岁实现财务自由（还有 {target - Math.floor(input.startAge)} 年）</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <SeekOption
          title="每月需要定投"
          value={needInvest}
          current={input.monthlyInvest}
          nullText="把结余全部投进去也达不到——需要提高收入或降低退休后支出"
          zeroText="现在的资产已经够了，不需要再定投"
          warn={needInvest !== null && needInvest > surplus ? `超过目前每月结余 ${formatYen(Math.max(0, surplus))}` : undefined}
          onApply={needInvest !== null ? () => set('monthlyInvest', needInvest) : undefined}
        />
        <SeekOption
          title="或者，退休后每月最多花"
          value={maxSpend}
          current={input.retireSpendMonthly}
          nullText="这个年龄来不及，试试晚几年"
          onApply={maxSpend !== null ? () => set('retireSpendMonthly', maxSpend) : undefined}
        />
      </div>
      <p className="text-[11px] text-notion-text-muted mt-3 leading-relaxed">
        其他参数保持左侧的设置不变；按「资产 ≥ 年支出 ÷ 提取率」判断是否达成。
      </p>
    </Card>
  );
}

function SeekOption({
  title, value, current, nullText, zeroText, warn, onApply,
}: {
  title: string;
  value: number | null;
  current: number;
  nullText: string;
  zeroText?: string;
  warn?: string;
  onApply?: () => void;
}) {
  const same = value !== null && Math.abs(value - current) < 1000;
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--c-bg-alt)] p-4">
      <div className="text-[12px] text-notion-text-secondary">{title}</div>
      {value === null ? (
        <p className="text-[13px] text-notion-warning mt-1.5 leading-relaxed">{nullText}</p>
      ) : value === 0 && zeroText ? (
        <p className="text-[13px] text-notion-success mt-1.5 leading-relaxed">{zeroText}</p>
      ) : (
        <>
          <div className="font-numeric font-semibold text-[22px] tabular-nums text-notion-text mt-0.5">{formatYen(value)}</div>
          <div className="text-[12px] text-notion-text-muted">现在 {formatYen(current)}</div>
          {warn && <div className="text-[12px] text-notion-warning mt-1">{warn}</div>}
          {onApply && !same && (
            <button onClick={onApply} className="btn-ghost text-[12px] mt-2 -ml-2 text-[var(--c-accent-text)]">用这个值</button>
          )}
        </>
      )}
    </div>
  );
}

// ── 参数面板 ───────────────────────────────────────────────────

type ParamProps = {
  baseline: SimBaseline;
  input: SimInput;
  overrides: SimulatorSettings;
  set: <K extends Key>(k: K, v: SimulatorSettings[K]) => void;
  reset: (k: Key) => void;
};

function CoreParams({ baseline, input, overrides, set, reset, deltaOf }: ParamProps & { deltaOf: (k: Key) => number | null }) {
  const b = baseline.input;
  const moneyMax = (v: number, floor: number) => Math.max(floor, Math.ceil((v * 2) / 50_000) * 50_000);
  const fixedRetire = input.retireAge !== null;
  const ageMin = Math.ceil(input.startAge) + 1;

  return (
    <div className="space-y-5">
      <SliderParam
        label="每月定投"
        value={input.monthlyInvest}
        min={0} max={moneyMax(Math.max(b.monthlyInvest, b.monthlyIncome * 0.5), 300_000)} step={5000}
        kind="money"
        base={b.monthlyInvest}
        overridden={overrides.monthlyInvest !== undefined}
        delta={deltaOf('monthlyInvest')}
        onChange={(v) => set('monthlyInvest', v)}
        onReset={() => reset('monthlyInvest')}
        hint={`结余里没投出去的部分留作现金（${formatYen(Math.max(0, input.monthlyIncome - input.monthlyLivingCost - input.monthlyInvest))}/月）`}
      />
      <SliderParam
        label="退休后月支出"
        value={input.retireSpendMonthly}
        min={50_000} max={moneyMax(b.retireSpendMonthly, 600_000)} step={5000}
        kind="money"
        base={b.retireSpendMonthly}
        overridden={overrides.retireSpendMonthly !== undefined}
        delta={deltaOf('retireSpendMonthly')}
        onChange={(v) => set('retireSpendMonthly', v)}
        onReset={() => reset('retireSpendMonthly')}
      />
      <SliderParam
        label="预期年化收益"
        value={input.annualReturnPct}
        min={0} max={10} step={0.1}
        kind="pct"
        base={b.annualReturnPct}
        overridden={overrides.annualReturnPct !== undefined}
        delta={deltaOf('annualReturnPct')}
        onChange={(v) => set('annualReturnPct', v)}
        onReset={() => reset('annualReturnPct')}
        hint="扣除通胀后的实际收益（全球股票长期约 5%）"
      />
      <SliderParam
        label="安全提取率"
        value={input.withdrawalRatePct}
        min={2} max={6} step={0.1}
        kind="pct"
        base={b.withdrawalRatePct}
        overridden={overrides.withdrawalRatePct !== undefined}
        delta={deltaOf('withdrawalRatePct')}
        onChange={(v) => set('withdrawalRatePct', v)}
        onReset={() => reset('withdrawalRatePct')}
        hint={`目标 = 年支出 × ${Math.round((100 / input.withdrawalRatePct) * 10) / 10}`}
      />
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[13px] font-semibold text-notion-text">退休时间</span>
          {overrides.retireAge !== undefined && <ResetLink onClick={() => reset('retireAge')} />}
        </div>
        <SegToggle
          options={[{ v: false, l: '达到目标就退休' }, { v: true, l: '固定年龄' }]}
          value={fixedRetire}
          onChange={(v) => set('retireAge', v ? Math.max(ageMin, Math.min(80, Math.round(input.latestWorkAge))) : null)}
        />
        {fixedRetire ? (
          <div className="mt-3">
            <SliderParam
              label="退休年龄"
              value={input.retireAge!}
              min={ageMin} max={80} step={1}
              kind="age"
              overridden={false}
              onChange={(v) => set('retireAge', v)}
              onReset={() => reset('retireAge')}
            />
          </div>
        ) : (
          <p className="text-xs text-notion-text-muted mt-1.5 leading-relaxed">
            达不到目标时，最晚工作到 {input.latestWorkAge} 岁（在高级参数里改）
          </p>
        )}
      </div>
    </div>
  );
}

function AdvancedParams({ baseline, input, overrides, set, reset, onBirthYear }: ParamProps & { onBirthYear: (y: number) => Promise<void> }) {
  const b = baseline.input;
  const num = <K extends Key>(k: K, label: string, opts: { min: number; max: number; step?: number; unit: string; hint?: string; base: number }) => (
    <NumberParam
      label={label}
      value={(input as Record<string, unknown>)[k] as number}
      base={opts.base}
      unit={opts.unit}
      min={opts.min} max={opts.max} step={opts.step ?? 1}
      hint={opts.hint}
      overridden={overrides[k] !== undefined}
      onChange={(v) => set(k, v as SimulatorSettings[K])}
      onReset={() => reset(k)}
    />
  );
  const money = <K extends Key>(k: K, label: string, base: number, hint?: string) => (
    <MoneyParam
      label={label}
      value={(input as Record<string, unknown>)[k] as number}
      base={base}
      hint={hint}
      overridden={overrides[k] !== undefined}
      onChange={(v) => set(k, v as SimulatorSettings[K])}
      onReset={() => reset(k)}
    />
  );
  const bufferOn = input.cashBufferMonths !== null;

  return (
    <div className="space-y-1">
      <Collapsible label="收入与工作">
        {money('monthlyIncome', '月收入（到手）', b.monthlyIncome, `我的数据：近 ${baseline.periods} 期平均`)}
        {num('incomeGrowthPct', '每年涨薪', { min: -10, max: 15, step: 0.5, unit: '%', base: b.incomeGrowthPct, hint: '扣除通胀后的实际涨幅' })}
        {money('monthlyLivingCost', '工作期间月生活成本', b.monthlyLivingCost, '信用卡 + 账单 + 订阅 + 临时支出，不含投资')}
        {num('latestWorkAge', '最晚工作到', { min: Math.ceil(input.startAge) + 1, max: 85, unit: '岁', base: b.latestWorkAge, hint: '「达到目标就退休」模式下，达不到也在这个年龄停工资' })}
      </Collapsible>

      <Collapsible label="资产与收益">
        <ToggleRow
          label="现金自动转投资"
          desc={bufferOn ? `现金超过 ${input.cashBufferMonths} 个月生活费的部分，每月转入投资` : '结余留在现金里，不会自动投资'}
          checked={bufferOn}
          onChange={(v) => (v ? set('cashBufferMonths', 6) : reset('cashBufferMonths'))}
        />
        {bufferOn && num('cashBufferMonths', '保留现金', { min: 0, max: 60, unit: '个月', base: 6 })}
        <ToggleRow
          label="计入房产"
          desc={baseline.realEstate > 0 ? `房产 ${formatYen(baseline.realEstate)}；自住房不能按 4% 取出来花，默认不计入` : '资产页里没有房产'}
          checked={!!overrides.includeRealEstate}
          disabled={baseline.realEstate <= 0}
          onChange={(v) => (v ? set('includeRealEstate', true) : reset('includeRealEstate'))}
        />
        {num('feePct', '投资费率', { min: 0, max: 3, step: 0.05, unit: '%/年', base: b.feePct, hint: '信托报酬等，从收益里扣' })}
        {num('cashRatePct', '存款利率', { min: 0, max: 5, step: 0.05, unit: '%', base: b.cashRatePct })}
        {num('inflationPct', '通胀率', { min: 0, max: 10, step: 0.1, unit: '%', base: b.inflationPct, hint: '现金会按这个速度缩水；也用于「名义」金额换算' })}
        {num('taxPct', '投资收益税', { min: 0, max: 50, step: 0.1, unit: '%', base: b.taxPct, hint: 'NISA 内 0%；特定口座约 20.315%（卖出时只对收益部分征税）' })}
      </Collapsible>

      <Collapsible label="养老金与寿命">
        {num('pensionStartAge', '养老金开始领取', { min: 60, max: 75, unit: '岁', base: b.pensionStartAge })}
        {money('pensionMonthly', '养老金月额', b.pensionMonthly, '可以抄ねんきん定期便上的预估额（按今天的钱）')}
        {num('lifeExpectancy', '模拟到', { min: Math.ceil(input.startAge) + 5, max: 110, unit: '岁', base: b.lifeExpectancy })}
        <BirthYearField birthYear={baseline.birthYear!} onSave={onBirthYear} />
      </Collapsible>

      <Collapsible label={`大事件${input.events.length ? `（${input.events.length}）` : ''}`}>
        <EventsEditor
          events={overrides.events ?? []}
          startAge={input.startAge}
          onChange={(ev) => (ev.length ? set('events', ev) : reset('events'))}
        />
      </Collapsible>
    </div>
  );
}

// ── 参数控件 ───────────────────────────────────────────────────

function fmtValue(v: number, kind: 'money' | 'pct' | 'age'): string {
  if (kind === 'money') return formatYen(v);
  if (kind === 'pct') return `${Math.round(v * 100) / 100}%`;
  return `${Math.round(v)} 岁`;
}

function SliderParam({
  label, value, min, max, step, kind, base, overridden, delta, onChange, onReset, hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  kind: 'money' | 'pct' | 'age';
  base?: number;
  overridden: boolean;
  delta?: number | null;
  onChange: (v: number) => void;
  onReset: () => void;
  hint?: string;
}) {
  const d = delta != null ? deltaText(delta) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[13px] font-semibold text-notion-text">{label}</label>
        <InlineNumber value={value} kind={kind} onChange={onChange} ariaLabel={label} />
      </div>
      <input
        type="range"
        className="sim-range mt-1.5"
        min={min} max={Math.max(max, value)} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
      <div className="flex items-center justify-between gap-2 min-h-[18px] text-[11px]">
        {overridden && base !== undefined ? (
          <span className="text-notion-text-muted truncate">
            我的数据 {fmtValue(base, kind)} · <ResetLink onClick={onReset} inline />
          </span>
        ) : (
          <span className="text-notion-text-muted truncate">{hint ?? ''}</span>
        )}
        {d && (
          <span className={`flex-shrink-0 font-semibold ${d.good ? 'text-notion-success' : 'text-notion-warning'}`}>{d.text}</span>
        )}
      </div>
      {overridden && hint && <p className="text-[11px] text-notion-text-muted">{hint}</p>}
    </div>
  );
}

/** 滑块旁可直接输入的数值 */
function InlineNumber({ value, kind, onChange, ariaLabel }: { value: number; kind: 'money' | 'pct' | 'age'; onChange: (v: number) => void; ariaLabel: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (kind === 'money' ? Math.round(value).toLocaleString('en-US') : String(Math.round(value * 100) / 100));
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(/[^\d.-]/g, ''));
    if (Number.isFinite(n)) onChange(kind === 'age' ? Math.round(n) : n);
    setDraft(null);
  };
  return (
    <span className="inline-flex items-baseline gap-0.5 font-numeric font-semibold text-[14px] text-notion-text">
      {kind === 'money' && <span className="text-notion-text-muted text-[12px]">¥</span>}
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        className="w-24 text-right bg-transparent outline-none rounded-[var(--radius-sm)] px-1 -mx-1 hover:bg-[var(--c-bg-alt)] focus:bg-[var(--c-bg-alt)] tabular-nums"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => { setDraft(shown); e.currentTarget.select(); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
      {kind === 'pct' && <span className="text-notion-text-muted text-[12px]">%</span>}
      {kind === 'age' && <span className="text-notion-text-muted text-[12px]">岁</span>}
    </span>
  );
}

function NumberParam({
  label, value, base, unit, min, max, step, hint, overridden, onChange, onReset,
}: {
  label: string; value: number; base: number; unit: string; min: number; max: number; step: number;
  hint?: string; overridden: boolean; onChange: (v: number) => void; onReset: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
    setDraft(null);
  };
  return (
    <ParamShell label={label} overridden={overridden} baseText={`${base} ${unit}`} onReset={onReset} hint={hint}>
      <div className="relative">
        <input
          type="number" inputMode="decimal" min={min} max={max} step={step}
          className="input font-numeric pr-14"
          value={draft ?? String(Math.round(value * 100) / 100)}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          aria-label={label}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-notion-text-muted">{unit}</span>
      </div>
    </ParamShell>
  );
}

function MoneyParam({
  label, value, base, hint, overridden, onChange, onReset,
}: {
  label: string; value: number; base: number; hint?: string; overridden: boolean; onChange: (v: number) => void; onReset: () => void;
}) {
  return (
    <ParamShell label={label} overridden={overridden} baseText={formatYen(base)} onReset={onReset} hint={hint}>
      <MoneyInput value={Math.round(value)} onChange={onChange} ariaLabel={label} />
    </ParamShell>
  );
}

function ParamShell({
  label, overridden, baseText, onReset, hint, children,
}: { label: string; overridden: boolean; baseText: string; onReset: () => void; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <label className="label !mb-0">{label}</label>
        {overridden && (
          <span className="text-[11px] text-notion-text-muted whitespace-nowrap">
            我的数据 {baseText} · <ResetLink onClick={onReset} inline />
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-[11px] text-notion-text-muted mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}

function ResetLink({ onClick, inline }: { onClick: () => void; inline?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${inline ? '' : 'text-[12px]'} font-semibold text-[var(--c-accent-text)] hover:underline`}
    >
      恢复
    </button>
  );
}

function ToggleRow({
  label, desc, checked, disabled, onChange,
}: { label: string; desc: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${disabled ? 'opacity-60' : ''}`}>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-notion-text">{label}</div>
        <div className="text-[11px] text-notion-text-muted leading-relaxed mt-0.5">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-[var(--dur-base)] ${
          checked ? 'bg-[var(--c-accent)]' : 'bg-[var(--c-border-strong)]'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-[var(--shadow-xs)] transition-transform duration-[var(--dur-base)] ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </div>
  );
}

function SegToggle<T extends string | number | boolean>({
  options, value, onChange,
}: { options: { v: T; l: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--c-bg-alt)] rounded-[var(--radius-md)]">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-2 py-1.5 rounded-[var(--radius-sm)] text-[12.5px] font-semibold transition-colors ${
            value === o.v ? 'bg-[var(--c-accent)] text-[var(--c-text-on-accent)] shadow-[var(--shadow-xs)]' : 'text-notion-text-secondary hover:text-notion-text'
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Pills<T extends string | boolean>({
  options, value, onChange,
}: { options: { v: T; l: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          className={`px-2.5 py-1 rounded-[var(--radius-pill)] text-[12px] font-semibold transition-colors ${
            value === o.v
              ? 'bg-[var(--c-accent-soft)] text-[var(--c-accent-text)]'
              : 'text-notion-text-secondary hover:bg-[var(--c-bg-alt)]'
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const map = {
    saving: { t: '保存中…', c: 'text-notion-text-muted' },
    saved: { t: '已保存', c: 'text-notion-text-muted' },
    error: { t: '保存失败', c: 'text-notion-warning' },
  } as const;
  return <span className={`text-[11px] ${map[state].c}`}>{map[state].t}</span>;
}

// ── 大事件 ─────────────────────────────────────────────────────

const EVENT_PRESETS: { name: string; amount: number; years: number; kind: SimEvent['kind']; inYears: number }[] = [
  { name: '买房首付', amount: 10_000_000, years: 0, kind: 'expense', inYears: 5 },
  { name: '结婚', amount: 3_000_000, years: 0, kind: 'expense', inYears: 3 },
  { name: '子女教育', amount: 10_000_000, years: 18, kind: 'expense', inYears: 4 },
  { name: '买车', amount: 3_000_000, years: 0, kind: 'expense', inYears: 3 },
  { name: '继承 / 赠与', amount: 10_000_000, years: 0, kind: 'income', inYears: 20 },
];

function EventsEditor({ events, startAge, onChange }: { events: SimEvent[]; startAge: number; onChange: (ev: SimEvent[]) => void }) {
  const add = (p: (typeof EVENT_PRESETS)[number] | null) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
    onChange([
      ...events,
      p
        ? { id, name: p.name, amount: p.amount, years: p.years, kind: p.kind, age: Math.ceil(startAge) + p.inYears }
        : { id, name: '', amount: 1_000_000, years: 0, kind: 'expense', age: Math.ceil(startAge) + 5 },
    ]);
  };
  const update = (id: string, patch: Partial<SimEvent>) => onChange(events.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => onChange(events.filter((e) => e.id !== id));

  return (
    <div className="space-y-3">
      {events.length === 0 && (
        <p className="text-[12px] text-notion-text-muted leading-relaxed">
          买房、结婚、子女教育等一次性大额支出（或继承等收入），会在对应年龄从资产里扣除或加入。
        </p>
      )}
      {events.map((e) => (
        <div key={e.id} className="rounded-[var(--radius-lg)] border border-[var(--c-border)] p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <input
              className="input !py-1.5 flex-1 min-w-0"
              value={e.name}
              placeholder="名称"
              maxLength={50}
              onChange={(ev) => update(e.id, { name: ev.target.value })}
              aria-label="大事件名称"
            />
            <button type="button" onClick={() => remove(e.id)} className="btn-ghost !p-1.5 text-notion-text-muted hover:text-notion-warning" aria-label="删除这个大事件">
              <Icon name="trash" size={14} />
            </button>
          </div>
          <SegToggle
            options={[{ v: 'expense' as const, l: '支出' }, { v: 'income' as const, l: '收入' }]}
            value={e.kind}
            onChange={(kind) => update(e.id, { kind })}
          />
          <MoneyInput value={e.amount} onChange={(amount) => update(e.id, { amount })} ariaLabel="大事件金额" />
          <div className="grid grid-cols-2 gap-2">
            <SmallNum label="发生年龄" unit="岁" value={e.age} min={Math.ceil(startAge)} max={110} onChange={(age) => update(e.id, { age })} />
            <SmallNum label="分摊" unit="年" value={e.years} min={0} max={50} onChange={(years) => update(e.id, { years })} hint={e.years === 0 ? '一次性' : undefined} />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {EVENT_PRESETS.map((p) => (
          <button key={p.name} type="button" onClick={() => add(p)} className="badge badge-muted hover:text-notion-text !py-1.5">
            + {p.name}
          </button>
        ))}
        <button type="button" onClick={() => add(null)} className="badge !py-1.5">+ 自定义</button>
      </div>
    </div>
  );
}

function SmallNum({
  label, unit, value, min, max, onChange, hint,
}: { label: string; unit: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div>
      <div className="text-[11px] text-notion-text-muted mb-0.5">{label}{hint ? ` · ${hint}` : ''}</div>
      <div className="relative">
        <input
          type="number" inputMode="numeric" min={min} max={max}
          className="input !py-1.5 font-numeric pr-8"
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            if (draft !== null && draft.trim() !== '' && Number.isFinite(Number(draft))) onChange(Math.max(min, Math.min(max, Number(draft))));
            setDraft(null);
          }}
          aria-label={label}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-notion-text-muted">{unit}</span>
      </div>
    </div>
  );
}

// ── 出生年份 ───────────────────────────────────────────────────

function BirthYearPrompt({ onSave }: { onSave: (y: number) => Promise<void> }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = /^\d{4}$/.test(year) && Number(year) >= 1920 && Number(year) <= thisYear - 10;
  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try { await onSave(Number(year)); } catch { setErr('保存失败，请稍后重试'); } finally { setBusy(false); }
  };
  return (
    <Card className="max-w-lg">
      <h2 className="text-[16px] font-semibold text-notion-text">先填一下出生年份</h2>
      <p className="text-[13px] text-notion-text-secondary mt-1.5 leading-relaxed">
        模拟按年龄推演（几岁实现财务自由、养老金几岁开始、钱能撑到几岁）。只需填一次，保存在你的账户里，之后可以在参数里修改。
      </p>
      <form className="flex items-center gap-2 mt-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          type="number" inputMode="numeric" placeholder="例如 1990"
          className="input font-numeric w-36"
          value={year}
          onChange={(e) => setYear(e.target.value.slice(0, 4))}
          aria-label="出生年份"
          autoFocus
        />
        <button type="submit" className="btn-primary" disabled={!valid || busy}>{busy ? '保存中…' : '开始模拟'}</button>
      </form>
      {year && !valid && <p className="text-[12px] text-notion-warning mt-2">请填 1920 ~ {thisYear - 10} 之间的年份</p>}
      {valid && <p className="text-[12px] text-notion-text-muted mt-2">今年 {currentAge(Number(year))} 岁</p>}
      {err && <p className="text-[12px] text-notion-warning mt-2">{err}</p>}
    </Card>
  );
}

function BirthYearField({ birthYear, onSave }: { birthYear: number; onSave: (y: number) => Promise<void> }) {
  const thisYear = new Date().getFullYear();
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const commit = () => {
    if (draft === null) return;
    const y = Number(draft);
    if (/^\d{4}$/.test(draft) && y >= 1920 && y <= thisYear - 10 && y !== birthYear) {
      onSave(y).then(() => setErr(false)).catch(() => setErr(true));
    }
    setDraft(null);
  };
  return (
    <div>
      <label className="label">出生年份</label>
      <input
        type="number" inputMode="numeric"
        className="input font-numeric"
        value={draft ?? String(birthYear)}
        onChange={(e) => setDraft(e.target.value.slice(0, 4))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        aria-label="出生年份"
      />
      <p className={`text-[11px] mt-1 ${err ? 'text-notion-warning' : 'text-notion-text-muted'}`}>
        {err ? '保存失败，请稍后重试' : `今年 ${currentAge(birthYear)} 岁 · 保存在账户里`}
      </p>
    </div>
  );
}
