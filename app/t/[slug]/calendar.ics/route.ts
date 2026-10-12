import { loadTrip } from '@/lib/trip-data';
import { icsFor } from '@/lib/trip-derive';

export const dynamic = 'force-dynamic';

/** "Add to calendar" for a locked-in plan: an all-day event over the locked dates. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = await loadTrip(slug);
  if (!trip?.plan?.start || !trip.plan.end) return new Response('No dates locked in yet.', { status: 404 });
  const place = trip.dests.find((d) => d.id === trip.plan!.destId)?.name ?? null;
  const body = icsFor({
    tripId: trip.id,
    name: trip.name,
    place,
    start: trip.plan.start,
    end: trip.plan.end,
    url: new URL(`/t/${trip.id}`, req.url).toString(),
  });
  const file = trip.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'trip';
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${file}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
