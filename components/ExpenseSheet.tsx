'use client';

import { Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { deleteExpense, saveExpense, type ExpenseInput } from '@/lib/actions';
import {
  SPLIT_LABEL,
  cash,
  centsInput,
  defaultNights,
  expenseError,
  owedOf,
  parseCents,
  type Expense,
  type SplitMode,
} from '@/lib/costs';
import { dayList, shortDay } from '@/lib/trip-derive';
import { Sheet } from './Sheet';
import { useToast } from './toast';
import { useTrip } from './TripProvider';
import { Avatar } from './ui';

/** A v4 UUID, also on plain-http dev hosts where crypto.randomUUID is missing. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const toInput = (e: Expense, createdAt?: string): ExpenseInput => ({
  id: e.id,
  kind: e.kind,
  desc: e.desc,
  cents: e.cents,
  paidBy: e.paidBy,
  split: e.split,
  day: e.day,
  shares: e.shares,
  createdAt,
});

/** Save / delete with optimistic updates, toasts and undo. Shared by the sheet and "Mark paid". */
export function useExpenses() {
  const { trip, meId, run } = useTrip();
  const toast = useToast();

  const save = async (next: Expense, msg: string) => {
    if (!meId) return false;
    const prev = trip.expenses.find((e) => e.id === next.id);
    const r = await run({ t: 'expense', expense: next }, () => saveExpense(meId, toInput(next)));
    if (!r.ok) return false;
    toast(msg, () =>
      prev
        ? run({ t: 'expense', expense: prev }, () => saveExpense(meId, toInput(prev)))
        : run({ t: 'removeExpense', id: next.id }, () => deleteExpense(meId, next.id)),
    );
    return true;
  };

  const remove = async (e: Expense, msg: string) => {
    if (!meId) return;
    const r = await run({ t: 'removeExpense', id: e.id }, () => deleteExpense(meId, e.id));
    if (r.ok) toast(msg, () => run({ t: 'expense', expense: e }, () => saveExpense(meId, toInput(e, e.createdAt))));
  };

  return { save, remove };
}

type Row = { on: boolean; nights: number; exact: string };

export function ExpenseSheet({
  expense,
  kind = expense?.kind ?? 'expense',
  onClose,
}: {
  expense?: Expense;
  kind?: Expense['kind'];
  onClose: () => void;
}) {
  const { trip, meId, nameOf } = useTrip();
  const { save, remove } = useExpenses();
  const isPayment = kind === 'payment';

  // Current people, plus anyone who left but is already on this expense.
  const people = useMemo(() => {
    const inIt = new Set(expense ? [expense.paidBy, ...expense.shares.map((s) => s.pid)] : []);
    return [...trip.people, ...trip.former.filter((p) => inIt.has(p.id))];
  }, [trip.people, trip.former, expense]);

  const nightsFor = useMemo(() => defaultNights(trip.expenses, trip.plan), [trip.expenses, trip.plan]);
  const [desc, setDesc] = useState(expense?.desc ?? '');
  const [amount, setAmount] = useState(expense ? centsInput(expense.cents) : '');
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? meId ?? people[0]?.id ?? '');
  const [day, setDay] = useState(expense?.day ?? '');
  const [split, setSplit] = useState<SplitMode>(expense?.split ?? 'equal');
  const [to, setTo] = useState(isPayment ? (expense?.shares[0]?.pid ?? '') : '');
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      people.map((p) => {
        const s = expense?.shares.find((x) => x.pid === p.id);
        const on = expense ? !!s : true;
        return [
          p.id,
          {
            on,
            nights: expense?.split === 'nights' && s ? s.units : nightsFor(p.id),
            exact: expense?.split === 'exact' && s ? centsInput(s.units) : '',
          },
        ];
      }),
    ),
  );
  const [err, setErr] = useState('');

  const cents = parseCents(amount);
  const set = (pid: string, patch: Partial<Row>) => {
    setRows((r) => ({ ...r, [pid]: { ...r[pid], ...patch } }));
    setErr('');
  };
  const onIds = people.filter((p) => rows[p.id]?.on).map((p) => p.id);
  const allOn = onIds.length === people.length;

  const shares = isPayment
    ? to
      ? [{ pid: to, units: Number.isFinite(cents) ? cents : 0 }]
      : []
    : onIds.map((pid) => ({
        pid,
        units: split === 'equal' ? 1 : split === 'nights' ? rows[pid].nights : parseCents(rows[pid].exact || '0'),
      }));
  const preview = Number.isFinite(cents) && cents > 0 && shares.every((s) => s.units > 0) ? owedOf({ cents, shares }) : {};
  const assigned = split === 'exact' ? shares.reduce((a, s) => a + (Number.isFinite(s.units) ? s.units : 0), 0) : 0;

  // Days to choose from: the locked plan's days if there are any, else the whole window.
  const days = trip.plan?.start && trip.plan.end ? dayList(trip.plan.start, trip.plan.end) : dayList(trip.start, trip.end);
  if (day && !days.includes(day)) days.unshift(day);

  const submit = async () => {
    const draft = {
      kind,
      desc: isPayment ? '' : desc.trim(),
      cents: Number.isFinite(cents) ? cents : 0,
      split: isPayment ? ('exact' as const) : split,
      shares,
    };
    if (isPayment && (!to || to === paidBy)) return setErr('Pick who got paid.');
    const e = expenseError(draft);
    if (e) return setErr(e);
    const next: Expense = {
      ...draft,
      id: expense?.id ?? newId(),
      paidBy,
      day: day || null,
      createdBy: expense?.createdBy ?? meId,
      createdAt: expense?.createdAt ?? new Date().toISOString(),
    };
    onClose();
    const what = isPayment ? `${nameOf(paidBy)} paid ${nameOf(to)} ${cash(next.cents)}` : next.desc;
    await save(next, expense ? 'Saved.' : isPayment ? `Recorded: ${what}.` : `Added ${what}.`);
  };

  const field = 'h-12 w-full rounded-xl border border-field bg-white px-3 text-base text-ink outline-none focus:border-ink';
  const label = 'text-xs font-bold tracking-[0.08em] text-subtle uppercase';

  return (
    <Sheet
      title={isPayment ? (expense ? 'Edit payment' : 'Record a payment') : expense ? 'Edit expense' : 'Add an expense'}
      kicker={trip.name}
      onClose={onClose}
    >
      {!isPayment && (
        <label className="flex flex-col gap-1.5">
          <span className={label}>What for</span>
          <input
            value={desc}
            onChange={(e) => {
              setDesc(e.target.value);
              setErr('');
            }}
            maxLength={80}
            placeholder="Cabin, groceries, gas…"
            className={field}
            autoFocus={!expense}
          />
        </label>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={label}>Amount</span>
          <span className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted">$</span>
            <input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setErr('');
              }}
              inputMode="decimal"
              placeholder="0"
              className={`${field} pl-6 tabular-nums`}
            />
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={label}>Day</span>
          <select value={day} onChange={(e) => setDay(e.target.value)} className={field}>
            <option value="">No day</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {shortDay(d)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={label}>{isPayment ? 'From' : 'Paid by'}</span>
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={field}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === meId ? `${p.name} (you)` : p.name}
              </option>
            ))}
          </select>
        </label>
        {isPayment && (
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className={label}>To</span>
            <select
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setErr('');
              }}
              className={field}
            >
              <option value="">Pick someone</option>
              {people
                .filter((p) => p.id !== paidBy)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === meId ? `${p.name} (you)` : p.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>

      {!isPayment && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className={label}>Split</span>
            <button
              onClick={() => {
                for (const p of people) set(p.id, { on: !allOn });
              }}
              className="-my-2 h-9 px-1 text-[13px] font-semibold text-muted underline underline-offset-[3px]"
            >
              {allOn ? 'Clear' : 'Everyone'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-[12px] bg-track p-1" role="radiogroup" aria-label="How to split">
            {(['equal', 'nights', 'exact'] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={split === m}
                onClick={() => {
                  setSplit(m);
                  setErr('');
                }}
                className={`h-10 rounded-[9px] text-[13px] font-bold text-ink ${split === m ? 'bg-surface shadow-tab' : ''}`}
              >
                {SPLIT_LABEL[m]}
              </button>
            ))}
          </div>
          {split === 'nights' && (
            <span className="text-[13px] text-muted">
              For stays: someone here 4 nights pays for 4 nights, someone here 3 pays for 3.
            </span>
          )}

          <div className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-white">
            {people.map((p) => {
              const r = rows[p.id];
              const share = preview[p.id];
              return (
                <div key={p.id} className="flex min-h-[56px] items-center gap-3 px-3 py-2">
                  <button
                    role="checkbox"
                    aria-checked={r.on}
                    onClick={() => set(p.id, { on: !r.on })}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] border-[1.5px] text-[13px] font-bold ${r.on ? 'border-ink bg-ink text-surface' : 'border-field'}`}
                      aria-hidden
                    >
                      {r.on ? '✓' : ''}
                    </span>
                    <Avatar name={p.name} hue={p.hue} size={28} />
                    <span className="flex min-w-0 flex-col">
                      <span className={`truncate text-[15px] font-semibold ${r.on ? 'text-ink' : 'text-disabled'}`}>
                        {p.id === meId ? `${p.name} (you)` : p.name}
                      </span>
                      {r.on && split !== 'exact' && (
                        <span className="text-xs text-muted tabular-nums">{share != null ? cash(share) : '—'}</span>
                      )}
                    </span>
                  </button>
                  {r.on && split === 'nights' && (
                    <span className="flex flex-none items-center gap-1">
                      <button
                        onClick={() => set(p.id, { nights: Math.max(1, r.nights - 1) })}
                        aria-label={`One fewer night for ${p.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-field"
                      >
                        <Minus size={15} strokeWidth={2.4} aria-hidden />
                      </button>
                      <span className="w-[54px] text-center text-sm font-bold tabular-nums">
                        {r.nights} {r.nights === 1 ? 'night' : 'nights'}
                      </span>
                      <button
                        onClick={() => set(p.id, { nights: Math.min(365, r.nights + 1) })}
                        aria-label={`One more night for ${p.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-field"
                      >
                        <Plus size={15} strokeWidth={2.4} aria-hidden />
                      </button>
                    </span>
                  )}
                  {r.on && split === 'exact' && (
                    <span className="relative w-[104px] flex-none">
                      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted">$</span>
                      <input
                        value={r.exact}
                        onChange={(e) => set(p.id, { exact: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`${p.name}'s amount`}
                        className="h-10 w-full rounded-[10px] border border-field bg-white pr-2 pl-5 text-right text-[15px] tabular-nums outline-none focus:border-ink"
                      />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {split === 'exact' && Number.isFinite(cents) && cents > 0 && (
            <span className={`text-[13px] font-semibold ${assigned === cents ? 'text-teal' : 'text-muted'}`}>
              {assigned === cents
                ? 'Adds up.'
                : assigned < cents
                  ? `${cash(cents - assigned)} of ${cash(cents)} left to assign`
                  : `${cash(assigned - cents)} over ${cash(cents)}`}
            </span>
          )}
        </div>
      )}

      {err && (
        <span role="alert" className="text-sm font-semibold text-danger">
          {err}
        </span>
      )}
      <div className="flex flex-col gap-2">
        <button onClick={submit} className="h-[54px] rounded-[14px] bg-ink text-[17px] font-bold text-surface active:scale-[0.98]">
          {expense ? 'Save' : isPayment ? 'Record payment' : 'Add expense'}
        </button>
        {expense && (
          <button
            onClick={() => {
              onClose();
              remove(expense, isPayment ? 'Payment deleted.' : `${expense.desc} deleted.`);
            }}
            className="h-11 text-sm font-semibold text-danger underline underline-offset-[3px]"
          >
            Delete {isPayment ? 'payment' : 'expense'}
          </button>
        )}
        <button onClick={onClose} className="h-11 text-[15px] font-semibold text-muted">
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
