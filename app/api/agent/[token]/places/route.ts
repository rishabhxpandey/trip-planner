import { MAX_PITCH, attribution, field, json, pitchFrom, preflight, readBody, touch, withAgent } from '@/lib/agent';
import { db } from '@/lib/db';
import { approvals, destinations } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export const OPTIONS = preflight;

export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  return withAgent(token, async (agent) => {
    const r = await readBody(req);
    if (!r.ok) return r.res;
    const name = String(field(r.body, 'name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!name) return json({ error: 'Give the place a "name".' }, 400);
    const note = String(field(r.body, 'note') ?? '').trim().slice(0, 280) || null;
    const rawPitch = field(r.body, 'pitch');
    const pitch = rawPitch !== undefined ? (pitchFrom({ pitch: rawPitch }) ?? '') : '';
    if (pitch.length > MAX_PITCH) return json({ error: 'pitch.text is over 8,000 characters.' }, 413);
    const source = attribution(agent, field(r.body, 'author'));
    try {
      const [d] = await db
        .insert(destinations)
        .values({
          tripId: agent.tripId,
          name,
          note,
          addedBy: agent.id,
          ...(pitch.trim()
            ? { pitchText: pitch.replace(/\s+$/, ''), pitchSource: source, pitchUpdatedBy: agent.id, pitchUpdatedAt: new Date() }
            : {}),
        })
        .returning({ id: destinations.id });
      await db.insert(approvals).values({ participantId: agent.id, destinationId: d.id }).onConflictDoNothing();
      touch(agent.tripId);
      return json({ id: d.id }, 201);
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
      if (code === '23505') return json({ error: `${name} is already on the list.` }, 409);
      throw e;
    }
  });
}
