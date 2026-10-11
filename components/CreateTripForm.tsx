'use client';

import { useState, useTransition } from 'react';
import { createTrip } from '@/lib/actions';
import { fmtDay, validateWindow } from '@/lib/trip-derive';

const today = () => {
  const d = new Date();
  return fmtDay(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};
const plusDays = (s: string, n: number) => {
  const [y, m, d] = s.split('-').map(Number);
  return fmtDay(Date.UTC(y, m - 1, d + n));
};

export function CreateTripForm() {
  const [name, setName] = useState('');
  const [start, setStart] = useState(() => plusDays(today(), 14));
  const [end, setEnd] = useState(() => plusDays(today(), 56));
  const [err, setErr] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const e = validateWindow(name, start, end);
    if (e) return setErr(e);
    startTransition(async () => {
      const r = await createTrip({ name, start, end });
      if (r && !r.ok) setErr(r.error);
    });
  };

  const field = 'h-[50px] w-full rounded-xl border border-field bg-white text-ink outline-none focus:border-ink';
  const cap = 'text-xs font-semibold tracking-[0.06em] text-subtle uppercase';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-[18px] rounded-[20px] border border-line bg-surface p-5"
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Trip name</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErr('');
          }}
          placeholder="Ski weekend, Lisbon '27…"
          maxLength={80}
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
        <span className="text-[13px] text-subtle">The range people pick from. Up to 90 days.</span>
      </div>
      {err && (
        <div role="alert" className="text-sm font-semibold text-danger">
          {err}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-[54px] rounded-[14px] bg-ink text-[17px] font-bold text-surface active:scale-[0.98] disabled:opacity-70"
      >
        {pending ? 'Creating…' : 'Create trip & get link'}
      </button>
    </form>
  );
}
