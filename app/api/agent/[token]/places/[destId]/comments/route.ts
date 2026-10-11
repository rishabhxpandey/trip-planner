import { and, eq } from 'drizzle-orm';
import { attribution, field, json, preflight, readBody, touch, withAgent } from '@/lib/agent';
import { db } from '@/lib/db';
import { comments, destinations } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string; destId: string }> };

export const OPTIONS = preflight;

export async function POST(req: Request, { params }: Ctx) {
  const { token, destId } = await params;
  return withAgent(token, async (agent) => {
    const r = await readBody(req);
    if (!r.ok) return r.res;
    const raw = typeof r.body === 'string' ? r.body : field(r.body, 'text');
    const text = String(raw ?? '').trim().slice(0, 2000);
    if (!text) return json({ error: 'Send { "text": "..." }.' }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(destId)) return json({ error: 'Unknown place.' }, 404);
    const [d] = await db
      .select({ id: destinations.id })
      .from(destinations)
      .where(and(eq(destinations.id, destId), eq(destinations.tripId, agent.tripId)))
      .limit(1);
    if (!d) return json({ error: 'Unknown place.' }, 404);
    const [c] = await db
      .insert(comments)
      .values({
        destinationId: destId,
        participantId: agent.id,
        text,
        isQuestion: field(r.body, 'question') === true,
        source: attribution(agent, field(r.body, 'author')),
      })
      .returning({ id: comments.id });
    touch(agent.tripId);
    return json({ id: c.id }, 201);
  });
}
