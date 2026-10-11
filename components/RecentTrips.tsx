'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { googleSignOut, tripSummaries } from '@/lib/actions';
import { deviceTrips } from '@/lib/client-store';
import type { TripSummary } from '@/lib/trip-data';
import { shortWindowLabel } from '@/lib/trip-derive';
import { useToast } from './toast';

export function RecentTrips({ signedInEmail, mine }: { signedInEmail: string | null; mine: TripSummary[] | null }) {
  const toast = useToast();
  const [device, setDevice] = useState<TripSummary[] | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('signedout')) {
      toast('Signed out. Names on this device stay picked.');
      window.history.replaceState(null, '', '/');
    }
    if (mine) return;
    const ids = deviceTrips();
    if (!ids.length) return setDevice([]);
    tripSummaries(ids).then(setDevice, () => setDevice([]));
  }, [mine, toast]);

  const list = mine ?? device ?? [];
  if (!signedInEmail && !list.length) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-xs font-bold tracking-[0.08em] text-subtle uppercase">{mine ? 'Your trips' : 'Trips on this device'}</span>
        {signedInEmail && (
          <form action={googleSignOut}>
            <button type="submit" className="h-9 p-0 text-[13px] text-muted">
              {signedInEmail} · <span className="underline underline-offset-[3px]">sign out</span>
            </button>
          </form>
        )}
      </div>
      {mine && !mine.length && <span className="text-sm text-muted">No trips yet. Create one above.</span>}
      {list.map((t) => (
        <Link
          key={t.id}
          href={`/t/${t.id}`}
          className="flex min-h-[60px] items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 text-left text-ink no-underline hover:border-ink hover:text-ink"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="display truncate text-[17px] font-bold tracking-[-0.01em]">{t.name}</span>
            <span className="text-[13px] text-subtle">{shortWindowLabel(t.start, t.end, t.people)}</span>
          </span>
          <span className="text-xl text-subtle" aria-hidden>
            →
          </span>
        </Link>
      ))}
    </div>
  );
}
