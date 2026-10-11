import { and, eq } from 'drizzle-orm';
import { MAX_PITCH, attribution, field, json, pitchFrom, preflight, readBody, touch, withAgent } from '@/lib/agent';
import { db } from '@/lib/db';
import { destinations } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string; destId: string }> };

export const OPTIONS = preflight;

async function put(req: Request, { params }: Ctx) {
  const { token, destId } = await params;
  return withAgent(token, async (agent) => {
    const r = await readBody(req);
    if (!r.ok) return r.res;
    const text = pitchFrom(r.body);
    if (text == null || !text.trim()) return json({ error: 'Send { "pitch": { "text": "..." } }.' }, 400);
    if (text.length > MAX_PITCH) return json({ error: 'pitch.text is over 8,000 characters.' }, 413);
    if (!/^[0-9a-f-]{36}$/i.test(destId)) return json({ error: 'Unknown place.' }, 404);
    const rows = await db
      .update(destinations)
      .set({
        pitchText: text.replace(/\s+$/, ''),
        pitchSource: attribution(agent, field(r.body, 'author')),
        pitchUpdatedBy: agent.id,
        pitchUpdatedAt: new Date(),
      })
      .where(and(eq(destinations.id, destId), eq(destinations.tripId, agent.tripId)))
      .returning({ id: destinations.id });
    if (!rows.length) return json({ error: 'Unknown place.' }, 404);
    touch(agent.tripId);
    return json({ ok: true, id: destId });
  });
}

export const PUT = put;
// Some agents can only POST.
export const POST = put;
