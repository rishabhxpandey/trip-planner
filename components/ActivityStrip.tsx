'use client';

import { useEffect, useMemo, useState } from 'react';
import { lastSeen, setLastSeen } from '@/lib/client-store';
import { activitySince } from '@/lib/trip-derive';
import { useTrip } from './TripProvider';

const SHOW = 4;

/** "Since you were here": what others did after this device's last visit to the trip. */
export function ActivityStrip() {
  const { trip, meId, ready } = useTrip();
  const [since, setSince] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  // Read the previous visit once, then mark this visit as seen (and again when leaving the page).
  useEffect(() => {
    if (!ready) return;
    setSince(lastSeen(trip.id));
    const mark = () => setLastSeen(trip.id, new Date().toISOString());
    mark();
    const onHide = () => document.visibilityState === 'hidden' && mark();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      mark();
    };
  }, [ready, trip.id]);

  const items = useMemo(() => (since ? activitySince(trip, since, meId) : []), [trip, since, meId]);
  if (hidden || !items.length) return null;

  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-teal-tint px-3.5 py-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-[0.08em] text-teal uppercase">Since you were here</span>
        <button onClick={() => setHidden(true)} aria-label="Dismiss" className="-my-2 -mr-2 h-9 w-9 text-lg text-teal-ink">
          ×
        </button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm leading-[1.35] text-ink">
        {items.slice(0, SHOW).map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-teal" aria-hidden />
            <span>{it.text}</span>
          </li>
        ))}
        {items.length > SHOW && <li className="pl-3.5 text-[13px] text-teal-ink">and {items.length - SHOW} more</li>}
      </ul>
    </div>
  );
}
