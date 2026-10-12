'use client';

import { useEffect, useState } from 'react';
import type { Person } from '@/lib/trip-derive';
import { useTrip } from './TripProvider';
import { Avatar, GoogleButton, LockIcon } from './ui';

export function NameSheet({
  canClose,
  onClose,
  onPick,
  onJoin,
  onLeave,
}: {
  canClose: boolean;
  onClose: () => void;
  onPick: (p: Person) => void;
  onJoin: (name: string) => Promise<boolean>;
  onLeave: () => void;
}) {
  const { trip, meId, sessionPid, googleEnabled, signedInEmail, startGoogle } = useTrip();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const me = trip.people.find((p) => p.id === meId);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const join = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const ok = await onJoin(n);
    setBusy(false);
    if (ok) setName('');
  };

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-[rgba(29,35,38,0.45)]" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div className="flex max-h-[88vh] w-full max-w-[480px] flex-col gap-[18px] overflow-auto rounded-t-[24px] bg-surface px-5 pt-2.5 pb-7">
        <span className="h-[5px] w-10 self-center rounded-full bg-field" />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-subtle">{trip.name}</span>
          <h2 id="sheet-title" className="display m-0 text-[28px] leading-[1.05] font-extrabold tracking-[-0.025em]">
            Who&apos;s this?
          </h2>
          <span className="text-[15px] leading-[1.4] text-muted">
            Pick your name so the group knows whose days are whose. We&apos;ll remember you on this phone.
          </span>
        </div>

        {trip.people.length > 0 && (
          <div className="flex flex-col gap-2">
            {trip.people.map((p) => {
              const sub =
                p.id === meId
                  ? 'You'
                  : p.locked && p.id !== sessionPid
                    ? 'Signed in'
                    : p.days.length
                      ? `${p.days.length} days`
                      : 'No days yet';
              return (
                <button
                  key={p.id}
                  onClick={() => onPick(p)}
                  className={`flex min-h-[54px] items-center gap-3 rounded-[14px] border-[1.5px] bg-white px-3 py-2 text-left text-ink hover:border-ink ${p.id === meId ? 'border-ink' : 'border-line'}`}
                >
                  <Avatar name={p.name} hue={p.hue} size={36} />
                  <span className="flex flex-1 items-center gap-1.5 text-base font-semibold">
                    {p.name}
                    {p.locked && <LockIcon size={13} />}
                  </span>
                  <span className="text-[13px] text-subtle">{sub}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="new-name" className="text-sm font-semibold">
            {trip.people.length ? 'Not on the list?' : "You're first. What's your name?"}
          </label>
          <div className="flex gap-2">
            <input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="Your name"
              autoComplete="given-name"
              maxLength={40}
              className="h-[50px] min-w-0 flex-1 rounded-xl border border-field bg-white px-3.5 text-[17px] text-ink outline-none focus:border-ink"
            />
            <button
              onClick={join}
              disabled={busy}
              className="h-[50px] rounded-xl bg-ink px-5 text-base font-bold text-surface disabled:opacity-60"
            >
              Join
            </button>
          </div>
        </div>

        {googleEnabled && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <span className="text-sm text-muted">
              {signedInEmail ? `Signed in as ${signedInEmail}.` : 'Joined on another device?'}
            </span>
            <GoogleButton
              label={signedInEmail ? (meId ? 'Lock my name' : 'Find my name') : 'Continue with Google'}
              onClick={() => startGoogle(signedInEmail && meId ? 'link' : 'find')}
            />
          </div>
        )}

        {canClose && (
          <button onClick={onClose} className="h-11 text-[15px] font-semibold text-muted">
            Cancel
          </button>
        )}

        {me &&
          (confirmLeave ? (
            <div className="flex flex-col gap-2.5 rounded-[14px] border border-veto-line bg-veto-bg/50 p-3.5">
              <span className="text-sm leading-[1.4] text-veto-fg">
                Leave {trip.name}? Your marked days, thumbs, veto and reactions are removed. Your comments and pitches stay.
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setConfirmLeave(false);
                    onLeave();
                  }}
                  className="h-11 flex-1 rounded-xl bg-danger text-[15px] font-bold text-surface"
                >
                  Leave trip
                </button>
                <button
                  onClick={() => setConfirmLeave(false)}
                  className="h-11 rounded-xl border border-field bg-white px-4 text-[15px] font-semibold text-ink"
                >
                  Stay
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmLeave(true)}
              className="h-11 self-center text-sm font-semibold text-danger underline underline-offset-[3px]"
            >
              Leave this trip
            </button>
          ))}
      </div>
    </div>
  );
}
