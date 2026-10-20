/**
 * 方案栏：选择正在编辑的方案（草稿 / 已保存的方案）、另存为、重命名、删除，以及「模拟 / 方案对比」切换。
 * 方案像文档一样自动保存：改参数就是在改当前选中的方案，切换不会丢东西。
 * 删除需要连点两次确认（误触保护）。
 */
import { useEffect, useRef, useState } from 'react';
import { MAX_SIM_PLANS, type SimulatorPlans } from '@cfp/shared';
import { Icon } from '../Icon';

export function PlanBar({
  state, view, onView, onSelect, onSaveAs, onRename, onDelete,
}: {
  state: SimulatorPlans;
  view: 'sim' | 'compare';
  onView: (v: 'sim' | 'compare') => void;
  onSelect: (id: string | null) => void;
  onSaveAs: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const active = state.plans.find((p) => p.id === state.active_id) ?? null;
  const [naming, setNaming] = useState<null | 'new' | 'rename'>(null);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);
  useEffect(() => { setConfirmDelete(false); setNaming(null); }, [state.active_id]);

  const full = state.plans.length >= MAX_SIM_PLANS;
  const startNaming = (mode: 'new' | 'rename') => {
    setNaming(mode);
    setName(mode === 'rename' && active ? active.name : nextName(state));
  };
  const submit = () => {
    const n = name.trim().slice(0, 30);
    if (!n) return;
    if (naming === 'new') onSaveAs(n);
    else if (naming === 'rename' && active) onRename(active.id, n);
    setNaming(null);
  };
  const askDelete = () => {
    if (!active) return;
    if (confirmDelete) {
      onDelete(active.id);
      setConfirmDelete(false);
      return;
    }
    setConfirmDelete(true);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDelete(false), 3000);
  };

  return (
    <div className="card px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2.5">
      {/* 模拟 / 方案对比 */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--c-bg-alt)] rounded-[var(--radius-md)]" role="tablist">
        {([['sim', '模拟'], ['compare', '方案对比']] as const).map(([v, l]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => onView(v)}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-[13px] font-semibold transition-colors ${
              view === v ? 'bg-[var(--c-accent)] text-[var(--c-text-on-accent)] shadow-[var(--shadow-xs)]' : 'text-notion-text-secondary hover:text-notion-text'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <span className="hidden sm:block w-px h-6 bg-[var(--c-border)]" aria-hidden="true" />

      {naming ? (
        <form className="flex items-center gap-2 flex-1 min-w-[240px]" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input
            className="input !py-1.5 flex-1 min-w-0"
            value={name}
            maxLength={30}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setNaming(null); }}
            placeholder="方案名称，如「45 岁退休」"
            aria-label="方案名称"
          />
          <button type="submit" className="btn-primary !py-1.5 text-[13px]" disabled={!name.trim()}>
            {naming === 'new' ? '保存' : '改名'}
          </button>
          <button type="button" className="btn-ghost text-[13px]" onClick={() => setNaming(null)}>取消</button>
        </form>
      ) : (
        <>
          <label className="flex items-center gap-2 text-[13px] text-notion-text-secondary">
            <span className="whitespace-nowrap">当前方案</span>
            <select
              className="input !py-1.5 !pr-8 min-w-[150px] font-semibold text-notion-text"
              value={state.active_id ?? ''}
              onChange={(e) => onSelect(e.target.value || null)}
              aria-label="选择方案"
            >
              <option value="">草稿（未命名）</option>
              {state.plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost text-[12.5px] flex items-center gap-1"
              onClick={() => startNaming('new')}
              disabled={full}
              title={full ? `最多保存 ${MAX_SIM_PLANS} 个方案` : undefined}
            >
              <Icon name="add" size={13} />
              {active ? '复制为新方案' : '保存为方案'}
            </button>
            {active && (
              <>
                <button type="button" className="btn-ghost text-[12.5px] flex items-center gap-1" onClick={() => startNaming('rename')}>
                  <Icon name="edit" size={13} />
                  重命名
                </button>
                <button
                  type="button"
                  className={`btn-ghost text-[12.5px] flex items-center gap-1 ${confirmDelete ? 'text-notion-warning font-semibold' : ''}`}
                  onClick={askDelete}
                  aria-label={confirmDelete ? `再点一次删除方案「${active.name}」` : `删除方案「${active.name}」`}
                >
                  <Icon name="trash" size={13} />
                  {confirmDelete ? '再点一次删除' : '删除'}
                </button>
              </>
            )}
          </div>
          <span className="text-[11px] text-notion-text-muted ml-auto">
            {active ? '改参数会自动保存到这个方案' : state.plans.length ? `已保存 ${state.plans.length} 个方案` : '保存后可以在「方案对比」里并排比较'}
          </span>
        </>
      )}
    </div>
  );
}

function nextName(s: SimulatorPlans): string {
  for (let i = s.plans.length + 1; i < 100; i++) {
    const n = `方案 ${i}`;
    if (!s.plans.some((p) => p.name === n)) return n;
  }
  return '新方案';
}
