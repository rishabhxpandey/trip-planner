import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tripFiles } from '@/lib/db/schema';
import { disposition, servePolicy } from '@/lib/files';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Open or download a trip file. Same access as the trip itself: anyone with the link. `?download=1` forces a download. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; fileId: string }> }) {
  const { slug, fileId } = await params;
  if (!UUID_RE.test(fileId)) return new Response('Not found.', { status: 404 });
  const [f] = await db
    .select()
    .from(tripFiles)
    .where(and(eq(tripFiles.id, fileId), eq(tripFiles.tripId, slug), isNull(tripFiles.deletedAt)))
    .limit(1);
  if (!f) return new Response('That file was removed.', { status: 404 });
  const policy = servePolicy(f.contentType);
  const inline = policy.inline && !new URL(req.url).searchParams.has('download');
  const headers: Record<string, string> = {
    'Content-Type': f.contentType,
    'Content-Length': String(f.data.byteLength),
    'Content-Disposition': disposition(f.name, inline),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  };
  // Scripts in an uploaded page run in an opaque origin: no access to this site's cookies, storage or actions.
  if (policy.sandbox) headers['Content-Security-Policy'] = 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads';
  return new Response(new Uint8Array(f.data), { headers });
}
