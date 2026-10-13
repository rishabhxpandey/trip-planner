// Shared costs (a small Splitwise): pure helpers shared by server and client. Type-only imports, so it runs under `node --test`.

import type { Plan } from './trip-derive';

/**
 * How an expense is divided among the people in it. Every mode stores integer `units` per person and
 * each person owes `amount * units / sum(units)`:
 * - equal: units are 1
 * - nights: units are nights stayed (3 nights vs 4 nights of a rental)
 * - exact: units are cents, and they add up to the amount
 */
export type SplitMode = 'equal' | 'nights' | 'exact';

export type Share = { pid: string; units: number };

export type Expense = {
  id: string;
  /** A payment is money handed back ("Sam paid Maya"): paidBy is the sender, the one share is the receiver. */
  kind: 'expense' | 'payment';
  desc: string;
  cents: number;
  paidBy: string;
  split: SplitMode;
  day: string | null;
  shares: Share[];
  createdBy: string | null;
  createdAt: string;
};

/** Someone who left the trip but still appears in its expenses. */
export type FormerPerson = { id: string; name: string; hue: number };

export const SPLIT_LABEL: Record<SplitMode, string> = { equal: 'Equally', nights: 'By nights', exact: 'Exact amounts' };
export const MAX_CENTS = 100_000_000; // $1,000,000

/** "$1,234.5" -> 123450. Returns NaN for anything that isn't a plain positive amount. */
export function parseCents(s: string): number {
  const t = String(s ?? '').replace(/[$,\s]/g, '');
  if (!/^\d*(\.\d{0,2})?$/.test(t) || !/\d/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100);
}

/** 123450 -> "$1,234.50"; whole dollars drop the cents ("$40"). */
export function cash(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const s = (abs / 100).toLocaleString('en-US', {
    minimumFractionDigits: abs % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return (neg ? '−$' : '$') + s;
}

/** Cents for an input box: 123450 -> "1234.50", 4000 -> "40". */
export const centsInput = (cents: number) => (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));

/**
 * Split `cents` by integer weights. Exact to the cent: leftover cents go to the largest remainders,
 * ties to the earlier person, so everyone sees the same numbers.
 */
export function splitCents(cents: number, units: number[]): number[] {
  const total = units.reduce((a, b) => a + b, 0);
  if (!total) return units.map(() => 0);
  const raw = units.map((u) => (cents * u) / total);
  const out = raw.map(Math.floor);
  let left = cents - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k].i]++;
  return out;
}

/** What each person in an expense owes, in cents. */
export function owedOf(e: Pick<Expense, 'cents' | 'shares'>): Record<string, number> {
  const parts = splitCents(e.cents, e.shares.map((s) => s.units));
  return Object.fromEntries(e.shares.map((s, i) => [s.pid, parts[i]]));
}

export type Balance = { paid: number; share: number; net: number };

/**
 * Per person: what they paid for the group, their share of expenses, and net (positive = owed money back).
 * Payments move net without counting as spending.
 */
export function balancesOf(expenses: Expense[]): Record<string, Balance> {
  const b: Record<string, Balance> = {};
  const at = (pid: string) => (b[pid] ??= { paid: 0, share: 0, net: 0 });
  for (const e of expenses) {
    at(e.paidBy).net += e.cents;
    if (e.kind === 'expense') at(e.paidBy).paid += e.cents;
    for (const [pid, c] of Object.entries(owedOf(e))) {
      at(pid).net -= c;
      if (e.kind === 'expense') at(pid).share += c;
    }
  }
  return b;
}

export type Transfer = { from: string; to: string; cents: number };

/** The fewest straightforward payments that zero everyone out: biggest debtor pays biggest creditor, repeat. */
export function settleUp(balances: Record<string, Balance>): Transfer[] {
  const owe = Object.entries(balances)
    .filter(([, v]) => v.net < 0)
    .map(([pid, v]) => ({ pid, c: -v.net }));
  const get = Object.entries(balances)
    .filter(([, v]) => v.net > 0)
    .map(([pid, v]) => ({ pid, c: v.net }));
  const out: Transfer[] = [];
  const big = (a: { pid: string; c: number }, b: { pid: string; c: number }) => b.c - a.c || a.pid.localeCompare(b.pid);
  while (owe.length && get.length) {
    owe.sort(big);
    get.sort(big);
    const d = owe[0];
    const g = get[0];
    const c = Math.min(d.c, g.c);
    out.push({ from: d.pid, to: g.pid, cents: c });
    d.c -= c;
    g.c -= c;
    if (!d.c) owe.shift();
    if (!g.c) get.shift();
  }
  return out;
}

/** Total spent by the group (payments excluded). */
export const totalSpent = (expenses: Expense[]) =>
  expenses.reduce((a, e) => a + (e.kind === 'expense' ? e.cents : 0), 0);

/** Nights in the locked plan (a 4-day plan is 3 nights), or null without locked dates. */
export function planNights(plan: Pick<Plan, 'start' | 'end'> | null): number | null {
  if (!plan?.start || !plan.end) return null;
  const [a, b] = [plan.start, plan.end].map((s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.max(1, Math.round((b - a) / 864e5));
}

/**
 * Starting nights for each person in a new "By nights" split: what they had on the most recent
 * nights split (people stay the same nights for the rental and the groceries), else the plan's nights, else 1.
 */
export function defaultNights(expenses: Expense[], plan: Pick<Plan, 'start' | 'end'> | null): (pid: string) => number {
  const last = [...expenses].reverse().find((e) => e.kind === 'expense' && e.split === 'nights');
  const seen = new Map(last?.shares.map((s) => [s.pid, s.units]) ?? []);
  const base = planNights(plan) ?? 1;
  return (pid) => seen.get(pid) ?? base;
}

/** Group expenses by day (dated days in order, then undated), newest added first within a day. */
export function byDay(expenses: Expense[]): { day: string | null; items: Expense[] }[] {
  const groups = new Map<string | null, Expense[]>();
  const sorted = [...expenses].sort(
    (a, b) => (a.day ?? '￿').localeCompare(b.day ?? '￿') || b.createdAt.localeCompare(a.createdAt),
  );
  for (const e of sorted) {
    const g = groups.get(e.day) ?? [];
    g.push(e);
    groups.set(e.day, g);
  }
  return [...groups].map(([day, items]) => ({ day, items }));
}

/** Validate an expense before saving. Returns an error message or null. */
export function expenseError(e: Pick<Expense, 'desc' | 'cents' | 'split' | 'shares' | 'kind'>): string | null {
  if (e.kind === 'expense' && !e.desc.trim()) return 'What was it for?';
  if (!Number.isInteger(e.cents) || e.cents <= 0) return 'Enter an amount.';
  if (e.cents > MAX_CENTS) return 'Keep it under $1,000,000.';
  if (!e.shares.length) return 'Pick who it’s for.';
  if (e.shares.some((s) => !Number.isInteger(s.units) || s.units <= 0)) {
    return e.split === 'nights' ? 'Nights must be at least 1.' : 'Every amount must be more than $0.';
  }
  if (new Set(e.shares.map((s) => s.pid)).size !== e.shares.length) return 'Someone is in there twice.';
  if (e.split === 'exact') {
    const sum = e.shares.reduce((a, s) => a + s.units, 0);
    if (sum !== e.cents) {
      const diff = e.cents - sum;
      return diff > 0 ? `${cash(diff)} still to assign.` : `That's ${cash(-diff)} too much.`;
    }
  }
  return null;
}
