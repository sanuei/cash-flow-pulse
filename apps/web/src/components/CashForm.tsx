import { useState, useEffect } from 'react';
import type { CashSource } from '@cfp/shared';
import { HeroAmount, Field, Collapsible, FormError, FormActions } from './FormKit';
import { MoneyInput } from './MoneyInput';

type FormData = { name: string; balance: number; locked_amount: number };

export function CashForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: CashSource;
  onSubmit: (data: FormData) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [balance, setBalance] = useState(initial?.balance ?? 0);
  const [lockedAmount, setLockedAmount] = useState(initial?.locked_amount ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setBalance(initial.balance);
      setLockedAmount(initial.locked_amount);
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('名称不能为空'); return; }
    if (lockedAmount > balance) { setError('锁定金额不能超过余额'); return; }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), balance, locked_amount: lockedAmount });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <HeroAmount label="账户余额" value={balance} onChange={setBalance} />

      <Field label="名称">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 PayPay / 钱包现金 / 银行活期"
        />
      </Field>

      <Collapsible label="锁定金额（高级）">
        <Field label="锁定金额" hint="如 PayPay 中用于还信用卡的「过路钱」，从可支配余额中扣除">
          <MoneyInput value={lockedAmount} onChange={setLockedAmount} ariaLabel="锁定金额" />
        </Field>
      </Collapsible>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
