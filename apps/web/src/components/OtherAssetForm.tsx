import { useState, useEffect } from 'react';
import { HeroAmount, Field, Segmented, Collapsible, FormError, FormActions } from './FormKit';
import type { AssetCategory } from '@cfp/shared';

type FormData = {
  name: string;
  category: AssetCategory;
  value: number;
  note: string | null;
};

const CATEGORY_OPTIONS: { value: AssetCategory; label: string }[] = [
  { value: 'stock', label: '股票/基金' },
  { value: 'crypto', label: '加密货币' },
  { value: 'real_estate', label: '房产' },
  { value: 'other', label: '其他' },
];

export function OtherAssetForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: FormData;
  onSubmit: (data: FormData) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<AssetCategory>(initial?.category ?? 'stock');
  const [value, setValue] = useState(initial?.value ?? 0);
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setCategory(initial.category);
      setValue(initial.value);
      setNote(initial.note ?? '');
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('名称不能为空'); return; }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), category, value, note: note.trim() || null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <HeroAmount label="当前价值" value={value} onChange={setValue} tone="accent" />

      <Field label="类别">
        <Segmented options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
      </Field>

      <Field label="名称">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 纳斯达克ETF / BTC / 自住房"
        />
      </Field>

      <Collapsible>
        <Field label="备注（可选）" hint="价值需要手动更新，不会自动获取实时行情">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 持仓/成本备注" />
        </Field>
      </Collapsible>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
