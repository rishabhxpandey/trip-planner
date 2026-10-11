import { ImageResponse } from 'next/og';
import { MIN_RANGE_DAYS } from '@/lib/config';
import { LogoRow, OG_SIZE, googleFont, oklchToHex } from '@/lib/og';
import { loadTrip } from '@/lib/trip-data';
import { initialOf, peopleLabel, rangeLabel, rangesOf, windowLabel } from '@/lib/trip-derive';

export const alt = 'Trip on Outward';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = await loadTrip(slug).catch(() => null);
  const name = trip?.name ?? 'Outward';
  const when = trip ? windowLabel(trip.start, trip.end, trip.people.length).split(' · ')[0] : 'Plan the trip, not the group chat.';
  const people = trip?.people ?? [];
  const r = trip ? rangesOf(trip, MIN_RANGE_DAYS) : null;
  const best = r?.kind === 'everyone' ? `Everyone's free ${rangeLabel(r.ranges[0].days)}` : null;
  const planning = `${peopleLabel(people.length)} planning`;
  const shown = people.slice(0, 8);
  const initials = shown.map((p) => initialOf(p.name)).join('');

  const [display, ui] = await Promise.all([
    googleFont('Bricolage Grotesque', 800, name + 'Outward' + initials, 96),
    googleFont('Instrument Sans', 600, when + planning + (best ?? '') + initials + '+0123456789'),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#F4EFE4', padding: 64 }}>
        <LogoRow />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              fontFamily: 'Bricolage',
              fontSize: name.length > 28 ? 76 : 96,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: '-0.035em',
              color: '#1D2326',
              maxWidth: 1070,
            }}
          >
            {name}
          </div>
          <div style={{ fontFamily: 'Instrument', fontSize: 36, fontWeight: 600, color: '#5E5D56' }}>{when}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', paddingLeft: 12 }}>
              {shown.map((p) => (
                <div
                  key={p.id}
                  style={{
                    width: 64,
                    height: 64,
                    marginLeft: -12,
                    borderRadius: 32,
                    border: '4px solid #F4EFE4',
                    background: oklchToHex(0.86, 0.07, p.hue),
                    color: oklchToHex(0.3, 0.07, p.hue),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Bricolage',
                    fontSize: 28,
                    fontWeight: 800,
                  }}
                >
                  {initialOf(p.name)}
                </div>
              ))}
            </div>
            <div style={{ fontFamily: 'Instrument', fontSize: 30, fontWeight: 600, color: '#1D2326' }}>{planning}</div>
          </div>
          {best && (
            <div
              style={{
                display: 'flex',
                background: '#C2491C',
                color: '#FFFCF5',
                borderRadius: 40,
                padding: '16px 28px',
                fontFamily: 'Instrument',
                fontSize: 28,
                fontWeight: 600,
              }}
            >
              {best}
            </div>
          )}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        ...(display ? [{ name: 'Bricolage', data: display, weight: 800 as const, style: 'normal' as const }] : []),
        ...(ui ? [{ name: 'Instrument', data: ui, weight: 600 as const, style: 'normal' as const }] : []),
      ],
    },
  );
}
