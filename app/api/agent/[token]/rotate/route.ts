import { eq } from 'drizzle-orm';
import { json, preflight, withAgent } from '@/lib/agent';
import { db } from '@/lib/db';
import { participants } from '@/lib/db/schema';
import { newAgentToken } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export const OPTIONS = preflight;

/** Regenerate a leaked token. The old link stops working immediately. */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  return withAgent(token, async (agent) => {
    const next = newAgentToken();
    await db.update(participants).set({ agentToken: next }).where(eq(participants.id, agent.id));
    return json({ token: next, url: new URL(`/api/agent/${next}`, req.url).toString() });
  });
}
