import { json, preflight, snapshotFor, withAgent } from '@/lib/agent';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export const OPTIONS = preflight;

export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  return withAgent(token, async (agent) => {
    const snap = await snapshotFor(agent);
    return snap ? json(snap) : json({ error: 'Trip not found.' }, 404);
  });
}
