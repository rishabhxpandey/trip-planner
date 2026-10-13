'use client';

import { ArrowRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  SPLIT_LABEL,
  balancesOf,
  byDay,
  cash,
  owedOf,
  settleUp,
  totalSpent,
  type Expense,
  type FormerPerson,
} from '@/lib/costs';
import { shortDay } from '@/lib/trip-derive';
import { ExpenseSheet, newId, useExpenses } from './ExpenseSheet';
import { useTrip } from './TripProvider';
import { Avatar } from './ui';

type Editing = { expense?: Expense; kind?: Expense['kind'] } | null;

export function CostsTab() {
  const { trip, meId, needMe, nameOf } = useTrip();
  const { save } = useExpenses();
  const [editing, setEditing] = useState<Editing>(null);
  const [view, setView] = useState<'list' | 'sheet'>('list');

  const balances = useMemo(() => balancesOf(trip.expenses), [trip.expenses]);
  const transfers = useMemo(() => settleUp(balances), [balances]);
  const spent = totalSpent(trip.expenses);
  const mine = meId ? balances[meId] : undefined;
  const open = (e: Editing) => {
    if (needMe()) return;
    setEditing(e);
  };

  const markPaid = (from: string, to: string, cents: number) => {
    if (needMe() || !meId) return;
    save(
      {
        id: newId(),
        kind: 'payment',
        desc: '',
        cents,
        paidBy: from,
        split: 'exact',
        day: null,
        shares: [{ pid: to, units: cents }],
        createdBy: meId,
        createdAt: new Date().toISOString(),
      },
      `Recorded: ${nameOf(from)} paid ${nameOf(to)} ${cash(cents)}.`,
    );
  };

  const addButton = (
    <button
      onClick={() => open({ kind: 'expense' })}
      className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-ink text-base font-bold text-surface active:scale-[0.98]"
    >
      <Plus size={18} strokeWidth={2.4} aria-hidden />
      Add an expense
    </button>
  );

  return (
    <div className="flex flex-col gap-4 px-5 pt-1">
      {!trip.expenses.length ? (
        <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
          <span className="display text-[21px] leading-[1.15] font-bold tracking-[-0.015em]">Split the costs</span>
          <span className="text-sm leading-[1.4] text-muted">
            Add what you paid for and pick who it’s for. Split equally, by nights stayed, or by exact amounts. Outward keeps a
            running tab and tells everyone who pays whom at the end. No limits.
          </span>
          {addButton}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Group spent" value={cash(spent)} />
            <Stat label="Your share" value={mine ? cash(mine.share) : '—'} />
            <Stat
              label={!mine || Math.abs(mine.net) < 1 ? 'You’re' : mine.net > 0 ? 'You’re owed' : 'You owe'}
              value={!mine || Math.abs(mine.net) < 1 ? 'even' : cash(Math.abs(mine.net))}
              tone={!mine || Math.abs(mine.net) < 1 ? undefined : mine.net > 0 ? 'text-teal' : 'text-danger'}
            />
          </div>

          {addButton}

          <section className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-[0.08em] text-subtle uppercase">Settle up</span>
              <button
                onClick={() => open({ kind: 'payment' })}
                className="-my-2 h-9 px-1 text-[13px] font-semibold text-muted underline underline-offset-[3px]"
              >
                Record a payment
              </button>
            </div>
            {!transfers.length && <span className="text-[15px] font-semibold text-teal">Everyone’s square.</span>}
            {transfers.map((t) => (
              <div key={`${t.from}-${t.to}`} className="flex min-h-11 items-center gap-2.5">
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-[15px]">
                  <strong className={t.from === meId ? 'text-danger' : ''}>{cap(nameOf(t.from))}</strong>
                  <ArrowRight size={14} strokeWidth={2.4} className="text-muted" aria-label="pays" />
                  <strong className={t.to === meId ? 'text-teal' : ''}>{nameOf(t.to)}</strong>
                  <span className="font-bold tabular-nums">{cash(t.cents)}</span>
                </span>
                <button
                  onClick={() => markPaid(t.from, t.to, t.cents)}
                  className="h-9 flex-none rounded-full border-[1.5px] border-ink px-3 text-[13px] font-bold"
                >
                  Mark paid
                </button>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-2 gap-1 self-start rounded-[12px] bg-track p-1" role="tablist" aria-label="View">
            {(['list', 'sheet'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`h-9 rounded-[9px] px-4 text-[13px] font-bold text-ink ${view === v ? 'bg-surface shadow-tab' : ''}`}
              >
                {v === 'list' ? 'By day' : 'Spreadsheet'}
              </button>
            ))}
          </div>

          {view === 'list' ? <DayList onOpen={(e) => open({ expense: e })} /> : <SpreadSheet onOpen={(e) => open({ expense: e })} />}
        </>
      )}

      {editing && <ExpenseSheet expense={editing.expense} kind={editing.kind} onClose={() => setEditing(null)} />}
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-line bg-surface px-3 py-2.5">
      <span className="truncate text-[11px] font-semibold tracking-[0.06em] text-subtle uppercase">{label}</span>
      <span className={`display truncate text-[20px] leading-none font-extrabold tracking-[-0.02em] tabular-nums ${tone ?? ''}`}>
        {value}
      </span>
    </div>
  );
}

/** Everyone who appears in the costs: current people, then anyone who left but is still on an expense. */
function useCostPeople(): (Pick<FormerPerson, 'id' | 'name' | 'hue'> & { left?: boolean })[] {
  const { trip } = useTrip();
  return useMemo(() => [...trip.people, ...trip.former.map((p) => ({ ...p, left: true }))], [trip.people, trip.former]);
}

function DayList({ onOpen }: { onOpen: (e: Expense) => void }) {
  const { trip, meId, nameOf } = useTrip();
  const people = useCostPeople();
  const groups = byDay(trip.expenses);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const dayTotal = totalSpent(g.items);
        return (
          <section key={g.day ?? 'none'} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <span className="text-xs font-bold tracking-[0.08em] text-subtle uppercase">{g.day ? shortDay(g.day) : 'No day'}</span>
              {dayTotal > 0 && <span className="text-[13px] font-semibold text-muted tabular-nums">{cash(dayTotal)}</span>}
            </div>
            <div className="flex flex-col divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface">
              {g.items.map((e) => {
                const owed = owedOf(e);
                const myShare = meId ? owed[meId] : undefined;
                if (e.kind === 'payment')
                  return (
                    <button key={e.id} onClick={() => onOpen(e)} className="flex min-h-[52px] items-center gap-3 px-3.5 py-2.5 text-left">
                      <span className="min-w-0 flex-1 text-sm text-muted">
                        {cap(nameOf(e.paidBy))} paid {nameOf(e.shares[0]?.pid ?? null)}
                      </span>
                      <span className="text-sm font-semibold text-muted tabular-nums">{cash(e.cents)}</span>
                    </button>
                  );
                const involved = e.shares.length === people.length ? 'Everyone' : e.shares.map((s) => people.find((p) => p.id === s.pid)?.name ?? 'Someone').join(', ');
                return (
                  <button key={e.id} onClick={() => onOpen(e)} className="flex min-h-[64px] items-start gap-3 px-3.5 py-3 text-left">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-bold">{e.desc}</span>
                      <span className="text-[13px] text-muted">
                        {cap(nameOf(e.paidBy))} paid · {e.split === 'equal' ? 'split' : SPLIT_LABEL[e.split].toLowerCase()} ·{' '}
                        {e.split === 'nights' ? e.shares.map((s) => `${people.find((p) => p.id === s.pid)?.name ?? 'Someone'} ${s.units}`).join(', ') : involved}
                      </span>
                    </span>
                    <span className="flex flex-none flex-col items-end gap-0.5">
                      <span className="text-[15px] font-bold tabular-nums">{cash(e.cents)}</span>
                      {myShare != null && <span className="text-xs text-muted tabular-nums">you {cash(myShare)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Rows are expenses, columns are people, cells are each person's share. Totals at the bottom. */
function SpreadSheet({ onOpen }: { onOpen: (e: Expense) => void }) {
  const { trip, meId } = useTrip();
  const people = useCostPeople();
  const balances = useMemo(() => balancesOf(trip.expenses), [trip.expenses]);
  const rows = byDay(trip.expenses).flatMap((g) => g.items.filter((e) => e.kind === 'expense'));
  const payments = trip.expenses.filter((e) => e.kind === 'payment').length;
  const th = 'sticky left-0 z-[1] bg-surface';
  const cell = 'px-2.5 py-2 text-right tabular-nums whitespace-nowrap';

  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-max min-w-full border-separate border-spacing-0 overflow-hidden rounded-[14px] border border-line bg-surface text-[13px]">
          <thead>
            <tr className="text-[11px] font-semibold tracking-[0.06em] text-subtle uppercase">
              <th className={`${th} border-b border-line px-3 py-2 text-left`}>Item</th>
              <th className={`${cell} border-b border-line font-semibold`}>Total</th>
              {people.map((p) => (
                <th key={p.id} className={`${cell} border-b border-line font-semibold`}>
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar name={p.name} hue={p.hue} size={20} className="!text-[10px]" />
                    <span className={p.id === meId ? 'text-ink' : ''}>{p.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const owed = owedOf(e);
              return (
                <tr key={e.id} onClick={() => onOpen(e)} className="cursor-pointer hover:bg-page">
                  <td className={`${th} max-w-[150px] border-b border-line px-3 py-2`}>
                    <span className="block truncate font-semibold">{e.desc}</span>
                    <span className="block text-[11px] text-subtle">
                      {e.day ? shortDay(e.day) : 'No day'} · {people.find((p) => p.id === e.paidBy)?.name ?? 'Someone'} paid
                    </span>
                  </td>
                  <td className={`${cell} border-b border-line font-bold`}>{cash(e.cents)}</td>
                  {people.map((p) => (
                    <td key={p.id} className={`${cell} border-b border-line ${owed[p.id] == null ? 'text-disabled' : ''}`}>
                      {owed[p.id] == null ? '–' : cash(owed[p.id])}
                      {e.split === 'nights' && owed[p.id] != null && (
                        <span className="block text-[10px] text-subtle">
                          {e.shares.find((s) => s.pid === p.id)?.units}n
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="font-semibold">
            {(
              [
                ['Paid', (id: string) => balances[id]?.paid ?? 0, totalSpent(trip.expenses)],
                ['Share', (id: string) => balances[id]?.share ?? 0, totalSpent(trip.expenses)],
                ['Balance', (id: string) => balances[id]?.net ?? 0, null],
              ] as const
            ).map(([name, val, total]) => (
              <tr key={name} className={name === 'Balance' ? 'bg-page' : ''}>
                <td className={`${th} px-3 py-2 text-left ${name === 'Balance' ? 'bg-page font-bold' : 'border-b border-line'}`}>{name}</td>
                <td className={`${cell} ${name === 'Balance' ? '' : 'border-b border-line'}`}>{total == null ? '' : cash(total)}</td>
                {people.map((p) => {
                  const v = val(p.id);
                  const tone = name === 'Balance' && Math.abs(v) >= 1 ? (v > 0 ? 'text-teal' : 'text-danger') : '';
                  return (
                    <td key={p.id} className={`${cell} ${tone} ${name === 'Balance' ? 'font-bold' : 'border-b border-line'}`}>
                      {name === 'Balance' && v > 0 ? '+' : ''}
                      {cash(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      <span className="px-1 text-xs text-subtle">
        Tap a row to edit. Balance is what each person is owed (+) or owes (−)
        {payments ? `, after ${payments} ${payments === 1 ? 'payment' : 'payments'}` : ''}.
      </span>
    </div>
  );
}
