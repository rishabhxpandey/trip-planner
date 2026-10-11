import { ImageResponse } from 'next/og';
import { LogoRow, OG_SIZE, googleFont } from '@/lib/og';

export const alt = 'Outward: plan the trip, not the group chat.';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const headline = 'Plan the trip, not the group chat.';
  const sub = 'Tap the days you’re free. Vote on where to go. No accounts.';
  const [display, ui] = await Promise.all([
    googleFont('Bricolage Grotesque', 800, headline + 'Outward', 96),
    googleFont('Instrument Sans', 600, sub),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#F4EFE4', padding: 72 }}>
        <LogoRow />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontFamily: 'Bricolage', fontSize: 104, fontWeight: 800, lineHeight: 0.98, letterSpacing: '-0.035em', color: '#1D2326', maxWidth: 1000 }}>
            {headline}
          </div>
          <div style={{ fontFamily: 'Instrument', fontSize: 36, fontWeight: 600, color: '#5E5D56' }}>{sub}</div>
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
