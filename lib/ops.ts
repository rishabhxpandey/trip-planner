// Optimistic updates: applied locally while the server action runs, then replaced by fresh server data.
import type { Expense } from './costs';
import type { TripFile } from './files';
import type { Comment, Dest, Plan, TripData } from './trip-derive';

export type Op =
  | { t: 'day'; pid: string; day: string; on: boolean }
  | { t: 'days'; pid: string; days: string[] }
  | { t: 'addDest'; dest: Dest }
  | { t: 'approve'; pid: string; did: string; on: boolean }
  | { t: 'veto'; pid: string; did: string | null }
  | { t: 'remove'; did: string }
  | { t: 'restore'; dest: Dest; vetoers: string[] }
  | { t: 'pitch'; pid: string; did: string; text: string; source?: string | null }
  | { t: 'react'; pid: string; did: string; emoji: string; on: boolean }
  | { t: 'comment'; did: string; comment: Comment }
  | { t: 'answer'; cid: string }
  | { t: 'leave'; pid: string }
  | { t: 'plan'; plan: Plan | null }
  | { t: 'editTrip'; name: string; start: string; end: string }
  | { t: 'expense'; expense: Expense }
  | { t: 'removeExpense'; id: string }
  | { t: 'removeFile'; id: string }
  | { t: 'restoreFile'; file: TripFile };

const mapDest = (trip: TripData, did: string, fn: (d: Dest) => Dest): TripData => ({
  ...trip,
  dests: trip.dests.map((d) => (d.id === did ? fn(d) : d)),
});

export function applyOp(trip: TripData, op: Op): TripData {
  switch (op.t) {
    case 'day':
      return {
        ...trip,
        people: trip.people.map((p) => {
          if (p.id !== op.pid) return p;
          const s = new Set(p.days);
          if (op.on) s.add(op.day);
          else s.delete(op.day);
          return { ...p, days: [...s].sort() };
        }),
      };
    case 'days':
      return { ...trip, people: trip.people.map((p) => (p.id === op.pid ? { ...p, days: [...op.days].sort() } : p)) };
    case 'addDest':
      return { ...trip, dests: [...trip.dests, op.dest] };
    case 'approve':
      return mapDest(trip, op.did, (d) => ({
        ...d,
        approvals: op.on ? [...d.approvals.filter((a) => a !== op.pid), op.pid] : d.approvals.filter((a) => a !== op.pid),
      }));
    case 'veto':
      return { ...trip, people: trip.people.map((p) => (p.id === op.pid ? { ...p, veto: op.did } : p)) };
    case 'remove':
      return {
        ...trip,
        plan:
          trip.plan?.destId === op.did ? (trip.plan.start ? { ...trip.plan, destId: null } : null) : trip.plan,
        dests: trip.dests.filter((d) => d.id !== op.did),
        people: trip.people.map((p) => (p.veto === op.did ? { ...p, veto: null } : p)),
      };
    case 'restore':
      return {
        ...trip,
        dests: trip.dests.some((d) => d.id === op.dest.id) ? trip.dests : [...trip.dests, op.dest],
        people: trip.people.map((p) => (op.vetoers.includes(p.id) && !p.veto ? { ...p, veto: op.dest.id } : p)),
      };
    case 'pitch':
      return mapDest(trip, op.did, (d) => ({
        ...d,
        pitchText: op.text,
        pitchUpdatedBy: op.pid,
        pitchUpdatedAt: new Date().toISOString(),
        pitchSource: !op.text.trim() ? null : op.source !== undefined ? op.source : d.pitchSource,
      }));
    case 'react':
      return mapDest(trip, op.did, (d) => {
        const cur = (d.reactions[op.emoji] ?? []).filter((x) => x !== op.pid);
        return { ...d, reactions: { ...d.reactions, [op.emoji]: op.on ? [...cur, op.pid] : cur } };
      });
    case 'comment':
      return mapDest(trip, op.did, (d) => ({ ...d, comments: [...d.comments, op.comment] }));
    case 'plan':
      return { ...trip, plan: op.plan };
    case 'editTrip':
      return {
        ...trip,
        name: op.name,
        start: op.start,
        end: op.end,
        people: trip.people.map((p) => ({ ...p, days: p.days.filter((d) => d >= op.start && d <= op.end) })),
      };
    case 'leave':
      return {
        ...trip,
        people: trip.people.filter((p) => p.id !== op.pid),
        dests: trip.dests.map((d) => ({
          ...d,
          approvals: d.approvals.filter((a) => a !== op.pid),
          reactions: Object.fromEntries(Object.entries(d.reactions).map(([e, ids]) => [e, ids.filter((x) => x !== op.pid)])),
        })),
      };
    case 'expense':
      return {
        ...trip,
        expenses: trip.expenses.some((e) => e.id === op.expense.id)
          ? trip.expenses.map((e) => (e.id === op.expense.id ? op.expense : e))
          : [...trip.expenses, op.expense],
      };
    case 'removeExpense':
      return { ...trip, expenses: trip.expenses.filter((e) => e.id !== op.id) };
    case 'removeFile':
      return { ...trip, files: trip.files.filter((f) => f.id !== op.id) };
    case 'restoreFile':
      return trip.files.some((f) => f.id === op.file.id)
        ? trip
        : { ...trip, files: [...trip.files, op.file].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    case 'answer':
      return {
        ...trip,
        dests: trip.dests.map((d) =>
          d.comments.some((c) => c.id === op.cid)
            ? { ...d, comments: d.comments.map((c) => (c.id === op.cid ? { ...c, answered: true } : c)) }
            : d,
        ),
      };
  }
}
