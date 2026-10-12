'use client';

import { useState } from 'react';
import { editTrip } from '@/lib/actions';
import { dayList, validateWindow } from '@/lib/trip-derive';
import { Sheet } from './Sheet';
import { useToast } from './toast';
import { useTrip } from './TripProvider';

/** Rename the trip or change its date window. Anyone can; undo puts it back. */
export function EditTripSheet({ onClose }: { onClose: () => void }) {
  const { trip, meId, run } = useTrip();
  const toast = useToast();
  const [name, setName] = useState(trip.name);
  const [start, setStart] = useState(trip.start);
  const [end, setEnd] = useState(trip.end);
  const [err, setErr] = useState('');

  const hidden = (() => {
    if (!start || !end || end < start) return 0;
    const keep = new Set(dayList(start, end));
    return new Set(trip.people.flatMap((p) => p.days.filter((d) => !keep.has(d)))).size;
  })();
  const lockedOutside = !!trip.plan?.start && (trip.plan.start < start || (trip.plan.end ?? '') > end);

  const save = async () => {
    const e = validateWindow(name, start, end);
    if (e) return setErr(e);
    if (!meId) return;
    const prev = { name: trip.name, start: trip.start, end: trip.end };
    const next = { name: name.trim(), start, end };
    if (next.name === prev.name && start === prev.start && end === prev.end) return onClose();
    onClose();
    const r = await run({ t: 'editTrip', ...next }, () => editTrip(meId, next));
    if (r.ok) toast('Trip updated.', () => run({ t: 'editTrip', ...prev }, () => editTrip(meId, prev)));
  };

  const field = 'h-[50px] w-full rounded-xl border border-field bg-white text-ink outline-none focus:border-ink';
  const cap = 'text-xs font-semibold tracking-[0.06em] text-subtle uppercase';

  return (
    <Sheet title="Edit trip" kicker="Anyone in the trip can change this" onClose={onClose}>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Trip name</span>
        <input
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setErr('');
          }}
          className={`${field} px-3.5 text-[17px]`}
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">When could it happen?</span>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex min-w-0 flex-col gap-1">
            <span className={cap}>From</span>
            <input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setErr('');
              }}
              className={`${field} px-3 text-base`}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={cap}>To</span>
            <input
              type="date"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setErr('');
              }}
              className={`${field} px-3 text-base`}
            />
          </label>
        </div>
        <span className="text-[13px] text-subtle">Up to 90 days.</span>
        {hidden > 0 && (
          <span className="rounded-[10px] bg-q-bg px-3 py-2.5 text-[13px] leading-[1.4] font-semibold text-q-fg">
            {hidden} marked {hidden === 1 ? 'day falls' : 'days fall'} outside the new window and will be hidden. They come back if you widen it again.
          </span>
        )}
        {lockedOutside && (
          <span className="rounded-[10px] bg-q-bg px-3 py-2.5 text-[13px] leading-[1.4] font-semibold text-q-fg">
            The locked-in dates are outside this window. The plan stays as it is.
          </span>
        )}
      </div>
      {err && (
        <span role="alert" className="text-sm font-semibold text-danger">
          {err}
        </span>
      )}
      <div className="flex gap-2">
        <button onClick={save} className="h-12 flex-1 rounded-xl bg-ink text-[15px] font-bold text-surface">
          Save
        </button>
        <button onClick={onClose} className="h-12 rounded-xl border border-field bg-surface px-[18px] text-[15px] font-semibold text-ink">
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
