import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  balancesOf,
  byDay,
  cash,
  defaultNights,
  expenseError,
  owedOf,
  parseCents,
  planNights,
  settleUp,
  splitCents,
  totalSpent,
  type Expense,
} from './costs.ts';

const exp = (o: Partial<Expense> & Pick<Expense, 'cents' | 'paidBy' | 'shares'>): Expense => ({
  id: Math.random().toString(36),
  kind: 'expense',
  desc: 'x',
  split: 'equal',
  day: null,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...o,
});
const each = (...pids: string[]) => pids.map((pid) => ({ pid, units: 1 }));

test('splitCents is exact to the cent and gives leftovers to earlier people on ties', () => {
  assert.deepEqual(splitCents(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(splitCents(100, [1, 1, 1, 1, 1, 1, 1]).reduce((a, b) => a + b), 100);
  assert.deepEqual(splitCents(0, [1, 2]), [0, 0]);
  assert.deepEqual(splitCents(500, []), []);
});

test('by nights: 4 nights pays more than 3 for the same rental', () => {
  const owed = owedOf({ cents: 140000, shares: [{ pid: 'A', units: 4 }, { pid: 'B', units: 4 }, { pid: 'C', units: 3 }, { pid: 'D', units: 3 }] });
  assert.deepEqual(owed, { A: 40000, B: 40000, C: 30000, D: 30000 });
});

test('balances and settle up', () => {
  const ex = [
    exp({ cents: 9000, paidBy: 'A', shares: each('A', 'B', 'C') }), // each owes 30
    exp({ cents: 3000, paidBy: 'B', shares: each('B', 'C') }), // each owes 15
  ];
  const b = balancesOf(ex);
  assert.equal(b.A.net, 6000);
  assert.equal(b.B.net, -1500);
  assert.equal(b.C.net, -4500);
  assert.equal(b.A.paid, 9000);
  assert.equal(b.C.share, 4500);
  assert.deepEqual(settleUp(b), [
    { from: 'C', to: 'A', cents: 4500 },
    { from: 'B', to: 'A', cents: 1500 },
  ]);
  assert.equal(totalSpent(ex), 12000);
});

test('a payment settles a debt without counting as spending', () => {
  const ex = [
    exp({ cents: 2000, paidBy: 'A', shares: each('A', 'B') }),
    exp({ kind: 'payment', split: 'exact', cents: 1000, paidBy: 'B', shares: [{ pid: 'A', units: 1000 }] }),
  ];
  const b = balancesOf(ex);
  assert.equal(b.A.net, 0);
  assert.equal(b.B.net, 0);
  assert.equal(b.B.share, 1000);
  assert.equal(totalSpent(ex), 2000);
  assert.deepEqual(settleUp(b), []);
});

test('amount parsing and formatting', () => {
  assert.equal(parseCents('$1,234.5'), 123450);
  assert.equal(parseCents('40'), 4000);
  assert.equal(parseCents('.99'), 99);
  assert.ok(Number.isNaN(parseCents('12.345')));
  assert.ok(Number.isNaN(parseCents('abc')));
  assert.ok(Number.isNaN(parseCents('')));
  assert.equal(cash(123450), '$1,234.50');
  assert.equal(cash(4000), '$40');
  assert.equal(cash(-150), '−$1.50');
});

test('validation', () => {
  const base = { kind: 'expense' as const, desc: 'Dinner', cents: 1000, split: 'equal' as const, shares: each('A') };
  assert.equal(expenseError(base), null);
  assert.equal(expenseError({ ...base, desc: ' ' }), 'What was it for?');
  assert.equal(expenseError({ ...base, shares: [] }), 'Pick who it’s for.');
  assert.equal(expenseError({ ...base, split: 'exact', shares: [{ pid: 'A', units: 400 }] }), '$6 still to assign.');
  assert.equal(expenseError({ ...base, split: 'exact', shares: [{ pid: 'A', units: 1000 }] }), null);
  assert.equal(expenseError({ ...base, split: 'nights', shares: [{ pid: 'A', units: 0 }] }), 'Nights must be at least 1.');
});

test('nights default to the last nights split, then the plan', () => {
  assert.equal(planNights({ start: '2026-11-12', end: '2026-11-15' }), 3);
  assert.equal(planNights(null), null);
  const ex = [exp({ cents: 100, paidBy: 'A', split: 'nights', shares: [{ pid: 'A', units: 4 }, { pid: 'B', units: 3 }] })];
  const n = defaultNights(ex, { start: '2026-11-12', end: '2026-11-15' });
  assert.equal(n('A'), 4);
  assert.equal(n('B'), 3);
  assert.equal(n('C'), 3);
  assert.equal(defaultNights([], null)('A'), 1);
});

test('byDay groups dated days in order, undated last', () => {
  const g = byDay([
    exp({ cents: 1, paidBy: 'A', shares: each('A'), day: null }),
    exp({ cents: 1, paidBy: 'A', shares: each('A'), day: '2026-11-13' }),
    exp({ cents: 1, paidBy: 'A', shares: each('A'), day: '2026-11-12' }),
  ]);
  assert.deepEqual(g.map((x) => x.day), ['2026-11-12', '2026-11-13', null]);
});
