import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { participants } from '@/lib/db/schema';
import { MIN_RANGE_DAYS } from '@/lib/config';
import { allow } from '@/lib/ratelimit';
import { isAgentToken } from '@/lib/tokens';
import { loadTrip } from '@/lib/trip-data';
import { PITCH_SCHEMA, normPitch, rangesOf, rankDests, vetoersOf } from '@/lib/trip-derive';

export const MAX_BODY = 20 * 1024;
export const MAX_PITCH = 8000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...CORS, 'Cache-Control': 'no-store' } });

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export type Agent = typeof participants.$inferSelect;

/** Resolve the token, rate-limit it, and run the handler. Errors become JSON. */
export async function withAgent(token: string, fn: (agent: Agent) => Promise<Response>): Promise<Response> {
  if (!isAgentToken(token)) return json({ error: 'Unknown agent link.' }, 404);
  if (!(await allow(token))) return json({ error: 'Slow down: 30 requests per minute.' }, 429);
  try {
    const [agent] = await db.select().from(participants).where(eq(participants.agentToken, token)).limit(1);
    if (!agent) return json({ error: 'Unknown agent link. It may have been regenerated.' }, 404);
    if (agent.leftAt) return json({ error: `${agent.name} left this trip, so this link no longer works.` }, 404);
    return await fn(agent);
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

/** Read a JSON (or plain text) body, capped at 20 KB. Returns undefined on an empty body. */
export async function readBody(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) return { ok: false, res: json({ error: 'Body is over 20 KB.' }, 413) };
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY) return { ok: false, res: json({ error: 'Body is over 20 KB.' }, 413) };
  if (!raw.trim()) return { ok: true, body: undefined };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    // Accept a bare string body (e.g. text/plain pitch).
    return { ok: true, body: raw };
  }
}

export const field = (body: unknown, key: string): unknown =>
  body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined;

export function attribution(agent: Agent, author: unknown): string {
  const a = typeof author === 'string' ? author.trim().replace(/\s+/g, ' ').slice(0, 30) : '';
  return `${agent.name}'s AI` + (a ? ` (${a})` : '');
}

/** Pitch from a body: `{ pitch: { text } }`, `{ pitch: "..." }`, `{ canvas }`, `{ text }` or a bare string. */
export function pitchFrom(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body === 'string') return body;
  const p = field(body, 'pitch');
  if (p !== undefined) return normPitch(p);
  if (field(body, 'canvas') !== undefined || field(body, 'text') !== undefined) return normPitch(body);
  return null;
}

export const touch = (tripId: string) => revalidatePath(`/t/${tripId}`, 'layout');

export async function snapshotFor(agent: Agent) {
  const trip = await loadTrip(agent.tripId);
  if (!trip) return null;
  const r = rangesOf(trip, MIN_RANGE_DAYS);
  return {
    trip: { name: trip.name, window_start: trip.start, window_end: trip.end },
    plan: trip.plan
      ? {
          start: trip.plan.start,
          end: trip.plan.end,
          place: trip.dests.find((d) => d.id === trip.plan!.destId)?.name ?? null,
          place_id: trip.plan.destId,
        }
      : null,
    you: { name: agent.name },
    people: trip.people.map((p) => ({ name: p.name, marked_days: p.days.length })),
    best_ranges: r.ranges.map((g) => ({
      start: g.start,
      end: g.end,
      days: g.length,
      ...(r.kind === 'closest' ? { missing: g.missing } : {}),
    })),
    best_ranges_kind: r.kind === 'everyone' ? 'everyone_free' : r.kind === 'closest' ? 'all_but_one_free' : 'none',
    places: rankDests(trip.dests).map((d) => ({
      id: d.id,
      name: d.name,
      note: d.note,
      approvals: d.approvals.length,
      vetoed: vetoersOf(trip, d.id).length > 0,
      pitch_text: d.pitchText,
    })),
    pitch_schema: JSON.parse(PITCH_SCHEMA),
  };
}
