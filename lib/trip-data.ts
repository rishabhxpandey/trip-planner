import { and, asc, between, eq, inArray, isNull } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/lib/db';
import { approvals, availability, comments, destinations, expenseShares, expenses, participants, reactions, trips } from '@/lib/db/schema';
import type { Expense, FormerPerson, SplitMode } from '@/lib/costs';
import type { Comment, Dest, Person, TripData } from '@/lib/trip-derive';

const iso = (d: Date | string | null) => (d == null ? null : typeof d === 'string' ? new Date(d).toISOString() : d.toISOString());

export type LoadedTrip = TripData & {
  /** participant id -> user id, server-only (never sent to the client). */
  owners: Record<string, string | null>;
};

export const loadTrip = cache(async (slug: string): Promise<LoadedTrip | null> => {
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(slug)) return null;
  const [trip] = await db.select().from(trips).where(eq(trips.id, slug)).limit(1);
  if (!trip) return null;

  const [all, avail, dests, appr, rx, cmts, exps, shares] = await Promise.all([
    db.select().from(participants).where(eq(participants.tripId, slug)).orderBy(asc(participants.createdAt)),
    db
      .select({ pid: availability.participantId, day: availability.day })
      .from(availability)
      .innerJoin(participants, eq(participants.id, availability.participantId))
      // Days outside the window are kept (so a window change can be undone) but not shown.
      .where(and(eq(participants.tripId, slug), between(availability.day, trip.windowStart, trip.windowEnd)))
      .orderBy(asc(availability.day)),
    db.select().from(destinations).where(eq(destinations.tripId, slug)).orderBy(asc(destinations.createdAt)),
    db
      .select({ pid: approvals.participantId, did: approvals.destinationId })
      .from(approvals)
      .innerJoin(destinations, eq(destinations.id, approvals.destinationId))
      .where(eq(destinations.tripId, slug))
      .orderBy(asc(approvals.createdAt)),
    db
      .select({ pid: reactions.participantId, did: reactions.destinationId, emoji: reactions.emoji })
      .from(reactions)
      .innerJoin(destinations, eq(destinations.id, reactions.destinationId))
      .where(eq(destinations.tripId, slug)),
    db
      .select({ c: comments })
      .from(comments)
      .innerJoin(destinations, eq(destinations.id, comments.destinationId))
      .where(eq(destinations.tripId, slug))
      .orderBy(asc(comments.createdAt)),
    db.select().from(expenses).where(eq(expenses.tripId, slug)).orderBy(asc(expenses.createdAt)),
    db
      .select({ eid: expenseShares.expenseId, pid: expenseShares.participantId, units: expenseShares.units })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .innerJoin(participants, eq(participants.id, expenseShares.participantId))
      .where(eq(expenses.tripId, slug))
      .orderBy(asc(participants.createdAt)),
  ]);
  const ppl = all.filter((p) => !p.leftAt);

  const days: Record<string, string[]> = {};
  for (const a of avail) (days[a.pid] ??= []).push(a.day);

  const people: Person[] = ppl.map((p) => ({
    id: p.id,
    name: p.name,
    hue: p.hue,
    locked: !!p.userId,
    veto: p.vetoDestinationId,
    days: days[p.id] ?? [],
    joinedAt: iso(p.createdAt)!,
  }));

  const destList: Dest[] = dests.map((d) => ({
    id: d.id,
    name: d.name,
    note: d.note,
    addedBy: d.addedBy,
    createdAt: iso(d.createdAt)!,
    pitchText: d.pitchText,
    pitchSource: d.pitchSource,
    pitchUpdatedBy: d.pitchUpdatedBy,
    pitchUpdatedAt: iso(d.pitchUpdatedAt),
    approvals: appr.filter((a) => a.did === d.id).map((a) => a.pid),
    reactions: {},
    comments: [],
  }));
  const byId = new Map(destList.map((d) => [d.id, d]));
  for (const r of rx) (byId.get(r.did)!.reactions[r.emoji] ??= []).push(r.pid);
  for (const { c } of cmts) {
    const cm: Comment = {
      id: c.id,
      by: c.participantId,
      text: c.text,
      isQuestion: c.isQuestion,
      answered: c.answered,
      source: c.source,
      createdAt: iso(c.createdAt)!,
    };
    byId.get(c.destinationId)!.comments.push(cm);
  }

  const sharesOf: Record<string, Expense['shares']> = {};
  for (const s of shares) (sharesOf[s.eid] ??= []).push({ pid: s.pid, units: s.units });
  const expenseList: Expense[] = exps.map((e) => ({
    id: e.id,
    kind: e.kind as Expense['kind'],
    desc: e.description,
    cents: e.amountCents,
    paidBy: e.paidBy,
    split: e.split as SplitMode,
    day: e.day,
    shares: sharesOf[e.id] ?? [],
    createdBy: e.createdBy,
    createdAt: iso(e.createdAt)!,
  }));
  const inExpenses = new Set(expenseList.flatMap((e) => [e.paidBy, ...e.shares.map((s) => s.pid)]));
  const former: FormerPerson[] = all
    .filter((p) => p.leftAt && inExpenses.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, hue: p.hue }));

  return {
    id: trip.id,
    name: trip.name,
    start: trip.windowStart,
    end: trip.windowEnd,
    people,
    dests: destList,
    plan:
      trip.lockedAt && (trip.lockedStart || trip.lockedDestinationId)
        ? {
            start: trip.lockedStart,
            end: trip.lockedEnd,
            destId: trip.lockedDestinationId,
            by: trip.lockedBy,
            at: iso(trip.lockedAt)!,
          }
        : null,
    expenses: expenseList,
    former,
    owners: Object.fromEntries(ppl.map((p) => [p.id, p.userId])),
  };
});

/** Strip server-only fields before handing to client components. */
export function publicTrip(t: LoadedTrip): TripData {
  const { owners: _owners, ...rest } = t;
  return rest;
}

export type TripSummary = { id: string; name: string; start: string; end: string; people: number };

export async function tripSummaries(ids: string[]): Promise<TripSummary[]> {
  const clean = [...new Set(ids)].filter((s) => /^[A-Za-z0-9_-]{4,32}$/.test(s)).slice(0, 50);
  if (!clean.length) return [];
  const [ts, ps] = await Promise.all([
    db.select().from(trips).where(inArray(trips.id, clean)),
    db
      .select({ tripId: participants.tripId })
      .from(participants)
      .where(and(inArray(participants.tripId, clean), isNull(participants.leftAt))),
  ]);
  const count: Record<string, number> = {};
  for (const p of ps) count[p.tripId] = (count[p.tripId] ?? 0) + 1;
  const byId = new Map(ts.map((t) => [t.id, t]));
  return clean
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({ id: t.id, name: t.name, start: t.windowStart, end: t.windowEnd, people: count[t.id] ?? 0 }));
}

export async function userTripSummaries(userId: string): Promise<TripSummary[]> {
  const rows = await db
    .select({ tripId: participants.tripId, createdAt: participants.createdAt })
    .from(participants)
    .where(and(eq(participants.userId, userId), isNull(participants.leftAt)))
    .orderBy(asc(participants.createdAt));
  return (await tripSummaries(rows.reverse().map((r) => r.tripId)));
}
