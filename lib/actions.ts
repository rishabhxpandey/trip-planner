'use server';

import { and, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser, googleEnabled, signIn, signOut } from '@/auth';
import { db } from '@/lib/db';
import { approvals, availability, comments, destinations, participants, reactions, trips } from '@/lib/db/schema';
import { tripSummaries as loadSummaries, type TripSummary } from '@/lib/trip-data';
import { EMOJI, HUES, dayList, validateWindow } from '@/lib/trip-derive';
import { newAgentToken } from '@/lib/tokens';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const slugId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 10);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isUnique = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
};
const refresh = (tripId: string) => revalidatePath(`/t/${tripId}`, 'layout');

class ActorError extends Error {}

/**
 * Resolve the acting participant. Identity is trust-based for unlocked names;
 * a locked name (user_id set) requires the matching Google session.
 */
async function actor(participantId: string) {
  if (!UUID_RE.test(participantId ?? '')) throw new ActorError('Pick your name first.');
  const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) throw new ActorError('Pick your name first.');
  await assertUnlocked(p);
  if (p.leftAt) throw new ActorError('You left this trip. Pick your name again to rejoin.');
  return p;
}

async function assertUnlocked(p: { name: string; userId: string | null }) {
  if (!p.userId) return;
  const u = await currentUser();
  if (u?.id !== p.userId) throw new ActorError(`“${p.name}” is locked. Sign in with Google to use it.`);
}

async function destIn(tripId: string, destId: string) {
  if (!UUID_RE.test(destId ?? '')) throw new ActorError('That place is gone.');
  const [d] = await db.select().from(destinations).where(eq(destinations.id, destId)).limit(1);
  if (!d || d.tripId !== tripId) throw new ActorError('That place is gone.');
  return d;
}

async function guard<T extends object>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ActorError) return fail(e.message);
    console.error(e);
    return fail('Something went wrong. Try again.');
  }
}

/* ---------- Trips ---------- */

export async function createTrip(input: { name: string; start: string; end: string }): Promise<Result> {
  const name = String(input.name ?? '').trim().slice(0, 80);
  const start = String(input.start ?? '');
  const end = String(input.end ?? '');
  const err = validateWindow(name, start, end);
  if (err) return fail(err);
  if (!DAY_RE.test(start) || !DAY_RE.test(end)) return fail('Pick a start and end date.');
  const id = slugId();
  try {
    await db.insert(trips).values({ id, name, windowStart: start, windowEnd: end });
  } catch (e) {
    console.error(e);
    return fail('Something went wrong. Try again.');
  }
  redirect(`/t/${id}`);
}

export async function tripSummaries(ids: string[]): Promise<TripSummary[]> {
  if (!Array.isArray(ids)) return [];
  try {
    return await loadSummaries(ids.map(String));
  } catch (e) {
    console.error(e);
    return [];
  }
}

/* ---------- Identity ---------- */

export async function joinTrip(tripId: string, rawName: string): Promise<Result<{ id: string; existing?: boolean }>> {
  return guard(async () => {
    const name = String(rawName ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) return fail('Type your name.');
    const [trip] = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!trip) return fail('This trip no longer exists.');
    const [ex] = await db
      .select()
      .from(participants)
      .where(and(eq(participants.tripId, tripId), sql`lower(${participants.name}) = lower(${name})`))
      .limit(1);
    if (ex && !ex.leftAt) return { ok: true, id: ex.id, existing: true };
    if (ex) {
      // Someone who left is coming back under the same name: revive that row.
      await assertUnlocked(ex);
      await db.update(participants).set({ leftAt: null }).where(eq(participants.id, ex.id));
      refresh(tripId);
      return { ok: true, id: ex.id };
    }

    const user = await currentUser();
    let userId: string | null = null;
    if (user) {
      const [mine] = await db
        .select({ id: participants.id })
        .from(participants)
        .where(and(eq(participants.tripId, tripId), eq(participants.userId, user.id), isNull(participants.leftAt)))
        .limit(1);
      if (!mine) {
        userId = user.id;
        // A name this user left earlier still holds their lock; release it so the new name can take it.
        await db
          .update(participants)
          .set({ userId: null })
          .where(and(eq(participants.tripId, tripId), eq(participants.userId, user.id), isNotNull(participants.leftAt)));
      }
    }
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(participants)
      .where(eq(participants.tripId, tripId));
    try {
      const [row] = await db
        .insert(participants)
        .values({ tripId, name, hue: HUES[n % HUES.length], userId, agentToken: newAgentToken() })
        .returning({ id: participants.id });
      refresh(tripId);
      return { ok: true, id: row.id };
    } catch (e) {
      if (isUnique(e)) return fail(`${name} is already in this trip. Pick it from the list.`);
      throw e;
    }
  });
}

/** Picking an existing name. Unlocked names are trust-based; locked ones need the right Google session. */
export async function claimParticipant(participantId: string): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const p = await actor(participantId);
    return { ok: true, id: p.id };
  });
}

export async function linkGoogle(participantId: string): Promise<Result<{ name: string }>> {
  return guard(async () => {
    const user = await currentUser();
    if (!user) return fail('Sign in with Google first.');
    const p = await actor(participantId);
    if (p.userId === user.id) return { ok: true, name: p.name };
    // One participant per user per trip: move the lock if this user held another name here.
    await db
      .update(participants)
      .set({ userId: null })
      .where(and(eq(participants.tripId, p.tripId), eq(participants.userId, user.id), ne(participants.id, p.id)));
    await db.update(participants).set({ userId: user.id }).where(eq(participants.id, p.id));
    refresh(p.tripId);
    return { ok: true, name: p.name };
  });
}

export async function googleSignIn(redirectTo: string) {
  if (!googleEnabled) return fail("Google sign-in isn't set up on this server yet.");
  const safe = typeof redirectTo === 'string' && redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';
  await signIn('google', { redirectTo: safe });
  return { ok: true as const };
}

export async function googleSignOut() {
  await signOut({ redirectTo: '/?signedout=1' });
}

/* ---------- Dates ---------- */

async function windowOf(tripId: string) {
  const [t] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  return new Set(dayList(t.windowStart, t.windowEnd));
}

export async function toggleDay(participantId: string, day: string, free: boolean): Promise<Result> {
  return guard(async () => {
    const p = await actor(participantId);
    if (!(await windowOf(p.tripId)).has(day)) return fail('That day is outside the trip window.');
    if (free) await db.insert(availability).values({ participantId: p.id, day }).onConflictDoNothing();
    else await db.delete(availability).where(and(eq(availability.participantId, p.id), eq(availability.day, day)));
    refresh(p.tripId);
    return { ok: true };
  });
}

/** Replace all of my free days (used by + Weekends, Clear and its undo). */
export async function setDays(participantId: string, days: string[]): Promise<Result> {
  return guard(async () => {
    const p = await actor(participantId);
    const win = await windowOf(p.tripId);
    const keep = [...new Set((Array.isArray(days) ? days : []).map(String))].filter((d) => win.has(d));
    await db.delete(availability).where(eq(availability.participantId, p.id));
    if (keep.length) await db.insert(availability).values(keep.map((day) => ({ participantId: p.id, day })));
    refresh(p.tripId);
    return { ok: true };
  });
}

/* ---------- Where ---------- */

export async function addDestination(
  participantId: string,
  rawName: string,
  rawNote: string,
): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const p = await actor(participantId);
    const name = String(rawName ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const note = String(rawNote ?? '').trim().slice(0, 280) || null;
    if (!name) return fail('Type a place.');
    try {
      const [d] = await db
        .insert(destinations)
        .values({ tripId: p.tripId, name, note, addedBy: p.id })
        .returning({ id: destinations.id });
      await db.insert(approvals).values({ participantId: p.id, destinationId: d.id });
      refresh(p.tripId);
      return { ok: true, id: d.id };
    } catch (e) {
      if (isUnique(e)) return fail(`${name} is already on the list.`);
      throw e;
    }
  });
}

export async function setApproval(participantId: string, destId: string, on: boolean): Promise<Result> {
  return guard(async () => {
    const p = await actor(participantId);
    await destIn(p.tripId, destId);
    if (on) await db.insert(approvals).values({ participantId: p.id, destinationId: destId }).onConflictDoNothing();
    else
      await db
        .delete(approvals)
        .where(and(eq(approvals.participantId, p.id), eq(approvals.destinationId, destId)));
    refresh(p.tripId);
    return { ok: true };
  });
}

/** One veto per person: set it, move it, or clear it (null). */
export async function setVeto(participantId: string, destId: string | null): Promise<Result> {
  return guard(async () => {
    const p = await actor(participantId);
    if (destId) await destIn(p.tripId, destId);
    await db.update(participants).set({ vetoDestinationId: destId }).where(eq(participants.id, p.id));
    refresh(p.tripId);
    return { ok: true };
  });
}

export type DestSnapshot = {
  dest: {
    id: string;
    name: string;
    note: string | null;
    addedBy: string | null;
    createdAt: string;
    pitchText: string;
    pitchSource: string | null;
    pitchUpdatedBy: string | null;
    pitchUpdatedAt: string | null;
  };
  approvals: string[];
  reactions: { participantId: string; emoji: string }[];
  comments: {
    id: string;
    participantId: string;
    text: string;
    isQuestion: boolean;
    answered: boolean;
    source: string | null;
    createdAt: string;
  }[];
  vetoers: string[];
};

export async function removeDestination(participantId: string, destId: string): Promise<Result<{ snapshot: DestSnapshot }>> {
  return guard(async () => {
    const p = await actor(participantId);
    const d = await destIn(p.tripId, destId);
    const [ap, rx, cm, vt] = await Promise.all([
      db.select().from(approvals).where(eq(approvals.destinationId, destId)),
      db.select().from(reactions).where(eq(reactions.destinationId, destId)),
      db.select().from(comments).where(eq(comments.destinationId, destId)),
      db.select({ id: participants.id }).from(participants).where(eq(participants.vetoDestinationId, destId)),
    ]);
    // FK ON DELETE SET NULL clears vetoes on it; cascades take approvals, reactions, comments.
    await db.delete(destinations).where(eq(destinations.id, destId));
    refresh(p.tripId);
    const iso = (x: Date | null) => (x ? new Date(x).toISOString() : null);
    return {
      ok: true,
      snapshot: {
        dest: {
          id: d.id,
          name: d.name,
          note: d.note,
          addedBy: d.addedBy,
          createdAt: iso(d.createdAt)!,
          pitchText: d.pitchText,
          pitchSource: d.pitchSource,
          pitchUpdatedBy: d.pitchUpdatedBy,
          pitchUpdatedAt: iso(d.pitchUpdatedAt),
        },
        approvals: ap.map((a) => a.participantId),
        reactions: rx.map((r) => ({ participantId: r.participantId, emoji: r.emoji })),
        comments: cm.map((c) => ({
          id: c.id,
          participantId: c.participantId,
          text: c.text,
          isQuestion: c.isQuestion,
          answered: c.answered,
          source: c.source,
          createdAt: iso(c.createdAt)!,
        })),
        vetoers: vt.map((v) => v.id),
      },
    };
  });
}

export async function restoreDestination(participantId: string, snap: DestSnapshot): Promise<Result> {
  return guard(async () => {
    const p = await actor(participantId);
    const s = snap?.dest;
    if (!s || !UUID_RE.test(s.id)) return fail("Couldn't undo that.");
    const members = new Set(
      (await db.select({ id: participants.id }).from(participants).where(eq(participants.tripId, p.tripId))).map((r) => r.id),
    );
    const inTrip = (id: string | null) => (id && members.has(id) ? id : null);
    try {
      await db.insert(destinations).values({
        id: s.id,
        tripId: p.tripId,
        name: String(s.name).slice(0, 80),
        note: s.note ? String(s.note).slice(0, 280) : null,
        addedBy: inTrip(s.addedBy),
        createdAt: new Date(s.createdAt),
        pitchText: String(s.pitchText ?? '').slice(0, 8000),
        pitchSource: s.pitchSource ? String(s.pitchSource).slice(0, 80) : null,
        pitchUpdatedBy: inTrip(s.pitchUpdatedBy),
        pitchUpdatedAt: s.pitchUpdatedAt ? new Date(s.pitchUpdatedAt) : null,
      });
    } catch (e) {
      if (isUnique(e)) return fail(`${s.name} is already back on the list.`);
      throw e;
    }
    const ap = (snap.approvals ?? []).filter((id) => members.has(id));
    if (ap.length) await db.insert(approvals).values(ap.map((id) => ({ participantId: id, destinationId: s.id }))).onConflictDoNothing();
    const rx = (snap.reactions ?? []).filter((r) => members.has(r.participantId) && (EMOJI as readonly string[]).includes(r.emoji));
    if (rx.length)
      await db
        .insert(reactions)
        .values(rx.map((r) => ({ participantId: r.participantId, destinationId: s.id, emoji: r.emoji })))
        .onConflictDoNothing();
    const cm = (snap.comments ?? []).filter((c) => members.has(c.participantId) && UUID_RE.test(c.id));
    if (cm.length)
      await db
        .insert(comments)
        .values(
          cm.map((c) => ({
            id: c.id,
            destinationId: s.id,
            participantId: c.participantId,
            text: String(c.text).slice(0, 2000),
            isQuestion: !!c.isQuestion,
            answered: !!c.answered,
            source: c.source ? String(c.source).slice(0, 80) : null,
            createdAt: new Date(c.createdAt),
          })),
        )
        .onConflictDoNothing();
    const vt = (snap.vetoers ?? []).filter((id) => members.has(id));
    if (vt.length)
      await db
        .update(participants)
        .set({ vetoDestinationId: s.id })
        .where(and(inArray(participants.id, vt), isNull(participants.vetoDestinationId)));
    refresh(p.tripId);
    return { ok: true };
  });
}

/* ---------- Pitch ---------- */

/** Save the pitch text. `source` undefined keeps the current one (manual edits); null clears it. */
export async function savePitch(
  participantId: string,
  destId: string,
  text: string,
  source?: string | null,
): Promise<Result> {
  return guard(async () => {
    const p = await actor(participantId);
    await destIn(p.tripId, destId);
    const body = String(text ?? '').replace(/\s+$/, '');
    if (body.length > 8000) return fail('Keep the pitch under 8,000 characters.');
    await db
      .update(destinations)
      .set({
        pitchText: body,
        pitchUpdatedBy: p.id,
        pitchUpdatedAt: new Date(),
        ...(source !== undefined ? { pitchSource: source ? String(source).slice(0, 80) : null } : {}),
        ...(body ? {} : { pitchSource: null }),
      })
      .where(eq(destinations.id, destId));
    refresh(p.tripId);
    return { ok: true };
  });
}

export async function setReaction(participantId: string, destId: string, emoji: string, on: boolean): Promise<Result> {
  return guard(async () => {
    if (!(EMOJI as readonly string[]).includes(emoji)) return fail('Unknown reaction.');
    const p = await actor(participantId);
    await destIn(p.tripId, destId);
    if (on) await db.insert(reactions).values({ participantId: p.id, destinationId: destId, emoji }).onConflictDoNothing();
    else
      await db
        .delete(reactions)
        .where(and(eq(reactions.participantId, p.id), eq(reactions.destinationId, destId), eq(reactions.emoji, emoji)));
    refresh(p.tripId);
    return { ok: true };
  });
}

export async function addComment(
  participantId: string,
  destId: string,
  text: string,
  isQuestion: boolean,
): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const p = await actor(participantId);
    await destIn(p.tripId, destId);
    const body = String(text ?? '').trim().slice(0, 2000);
    if (!body) return fail('Type something first.');
    const [c] = await db
      .insert(comments)
      .values({ destinationId: destId, participantId: p.id, text: body, isQuestion: !!isQuestion })
      .returning({ id: comments.id });
    refresh(p.tripId);
    return { ok: true, id: c.id };
  });
}

export async function markAnswered(participantId: string, commentId: string): Promise<Result> {
  return guard(async () => {
    const p = await actor(participantId);
    if (!UUID_RE.test(commentId ?? '')) return fail('That comment is gone.');
    const [c] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
    if (!c) return fail('That comment is gone.');
    await destIn(p.tripId, c.destinationId);
    await db.update(comments).set({ answered: true }).where(eq(comments.id, commentId));
    refresh(p.tripId);
    return { ok: true };
  });
}

/* ---------- Leaving ---------- */

export type LeaveSnapshot = { days: string[]; approvals: string[]; reactions: { destinationId: string; emoji: string }[]; veto: string | null };

/** Leave a trip: drop my days, votes, veto and reactions. Comments and pitches stay (shown as "Someone"). */
export async function leaveTrip(participantId: string): Promise<Result<{ snapshot: LeaveSnapshot }>> {
  return guard(async () => {
    const p = await actor(participantId);
    const [days, ap, rx] = await Promise.all([
      db.select({ day: availability.day }).from(availability).where(eq(availability.participantId, p.id)),
      db.select({ d: approvals.destinationId }).from(approvals).where(eq(approvals.participantId, p.id)),
      db.select({ d: reactions.destinationId, emoji: reactions.emoji }).from(reactions).where(eq(reactions.participantId, p.id)),
    ]);
    await db.delete(availability).where(eq(availability.participantId, p.id));
    await db.delete(approvals).where(eq(approvals.participantId, p.id));
    await db.delete(reactions).where(eq(reactions.participantId, p.id));
    await db.update(participants).set({ leftAt: new Date(), vetoDestinationId: null }).where(eq(participants.id, p.id));
    refresh(p.tripId);
    return {
      ok: true,
      snapshot: {
        days: days.map((d) => d.day),
        approvals: ap.map((a) => a.d),
        reactions: rx.map((r) => ({ destinationId: r.d, emoji: r.emoji })),
        veto: p.vetoDestinationId,
      },
    };
  });
}

/** Undo a leave: come back and restore what was removed (only what still fits the trip). */
export async function rejoinTrip(participantId: string, snap: LeaveSnapshot): Promise<Result> {
  return guard(async () => {
    if (!UUID_RE.test(participantId ?? '')) return fail("Couldn't undo that.");
    const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
    if (!p) return fail("Couldn't undo that.");
    await assertUnlocked(p);
    const win = await windowOf(p.tripId);
    const dests = new Set(
      (await db.select({ id: destinations.id }).from(destinations).where(eq(destinations.tripId, p.tripId))).map((d) => d.id),
    );
    const days = [...new Set((snap?.days ?? []).map(String))].filter((d) => win.has(d));
    const ap = [...new Set((snap?.approvals ?? []).map(String))].filter((d) => dests.has(d));
    const rx = (snap?.reactions ?? []).filter((r) => dests.has(r.destinationId) && (EMOJI as readonly string[]).includes(r.emoji));
    const veto = snap?.veto && dests.has(snap.veto) ? snap.veto : null;
    await db.update(participants).set({ leftAt: null, vetoDestinationId: veto }).where(eq(participants.id, p.id));
    if (days.length) await db.insert(availability).values(days.map((day) => ({ participantId: p.id, day }))).onConflictDoNothing();
    if (ap.length) await db.insert(approvals).values(ap.map((d) => ({ participantId: p.id, destinationId: d }))).onConflictDoNothing();
    if (rx.length)
      await db
        .insert(reactions)
        .values(rx.map((r) => ({ participantId: p.id, destinationId: r.destinationId, emoji: r.emoji })))
        .onConflictDoNothing();
    refresh(p.tripId);
    return { ok: true };
  });
}

/* ---------- Agent token ---------- */

export async function getAgentToken(participantId: string): Promise<Result<{ token: string }>> {
  return guard(async () => {
    const p = await actor(participantId);
    return { ok: true, token: p.agentToken };
  });
}

export async function rotateAgentToken(participantId: string): Promise<Result<{ token: string }>> {
  return guard(async () => {
    const p = await actor(participantId);
    const token = newAgentToken();
    await db.update(participants).set({ agentToken: token }).where(eq(participants.id, p.id));
    return { ok: true, token };
  });
}
