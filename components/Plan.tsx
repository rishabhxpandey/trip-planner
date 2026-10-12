'use client';

import { CalendarPlus, Lock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { setPlan, type PlanInput } from '@/lib/actions';
import {
  bestPlace,
  costOf,
  freeForPlan,
  money,
  planDateLabel,
  rankDests,
  rangeLabel,
  dayList,
  type Plan,
} from '@/lib/trip-derive';
import { Choice, Sheet } from './Sheet';
import { useToast } from './toast';
import { useTrip } from './TripProvider';

/** The locked-in plan, or a prompt to lock one in once there's something to decide on. */
export function PlanCard() {
  const { trip, heat, ranges, needMe, nameOf } = useTrip();
  const [open, setOpen] = useState(false);
  const plan = trip.plan;
  const start = () => {
    if (needMe()) return;
    setOpen(true);
  };

  if (!plan) {
    if (ranges.kind !== 'everyone' && !trip.dests.length) return null;
    return (
      <>
        <button
          onClick={start}
          className="flex min-h-14 items-center justify-between gap-3 rounded-[14px] border-[1.5px] border-dashed border-dash px-4 py-2.5 text-left text-ink hover:border-ink"
        >
          <span className="flex min-w-0 flex-col gap-px">
            <span className="text-[15px] font-bold">Ready to decide? Lock it in</span>
            <span className="text-[13px] text-muted">Pick the dates and place so everyone knows the plan.</span>
          </span>
          <Lock size={18} strokeWidth={2.2} className="flex-none text-muted" aria-hidden />
        </button>
        {open && <LockSheet onClose={() => setOpen(false)} />}
      </>
    );
  }

  const dest = trip.dests.find((d) => d.id === plan.destId);
  const dates = planDateLabel(plan);
  const nDays = plan.start && plan.end ? dayList(plan.start, plan.end).length : 0;
  const free = freeForPlan(heat, plan);
  const cost = dest ? costOf(dest.pitchText) : 0;
  const by = nameOf(plan.by);

  return (
    <>
      <div className="flex flex-col gap-3 rounded-[18px] bg-ink p-4 text-surface">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold tracking-[0.08em] text-accent uppercase">
            <Lock size={12} strokeWidth={2.6} aria-hidden />
            Locked in
          </span>
          <button onClick={start} className="-my-2 h-9 px-1 text-[13px] font-semibold text-dk-muted underline underline-offset-[3px]">
            Change
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {dest ? (
            <Link
              href={`/t/${trip.id}/p/${dest.id}`}
              className="display text-[26px] leading-[1.05] font-extrabold tracking-[-0.025em] text-surface no-underline hover:text-surface"
            >
              {dest.name}
            </Link>
          ) : (
            <span className="display text-[22px] leading-[1.1] font-extrabold tracking-[-0.02em] text-dk-muted">Place to be decided</span>
          )}
          <span className="text-base font-semibold text-dk-text">
            {dates ? `${dates} · ${nDays} ${nDays === 1 ? 'day' : 'days'}` : 'Dates to be decided'}
          </span>
          <span className="text-[13px] text-dk-muted">
            {[
              dates && heat.activeCount ? `${free} of ${heat.activeCount} free those days` : null,
              cost ? `~${money(cost)} / person` : null,
              `locked by ${by}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        {dates && (
          <a
            href={`/t/${trip.id}/calendar.ics`}
            className="flex h-11 items-center justify-center gap-2 self-start rounded-full bg-accent px-4 text-sm font-bold text-ink no-underline hover:text-ink"
          >
            <CalendarPlus size={16} strokeWidth={2.2} aria-hidden />
            Add to calendar
          </a>
        )}
      </div>
      {open && <LockSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function LockSheet({ onClose }: { onClose: () => void }) {
  const { trip, ranges, meId, run, nameOf } = useTrip();
  const toast = useToast();
  const plan = trip.plan;
  const options = ranges.ranges;

  const initialWhen = () => {
    if (plan?.start) return options.find((r) => r.start === plan.start && r.end === plan.end) ? `r:${plan.start}` : 'custom';
    if (plan) return 'none';
    return ranges.kind === 'everyone' && options[0] ? `r:${options[0].start}` : 'none';
  };
  const [when, setWhen] = useState<string>(initialWhen);
  const [cStart, setCStart] = useState(plan?.start ?? options[0]?.start ?? trip.start);
  const [cEnd, setCEnd] = useState(plan?.end ?? options[0]?.end ?? trip.start);
  const [where, setWhere] = useState<string>(plan ? (plan.destId ?? 'none') : (bestPlace(trip)?.id ?? 'none'));
  const [err, setErr] = useState('');

  const ranked = rankDests(trip.dests);
  const field = 'h-12 w-full rounded-xl border border-field bg-white px-3 text-base text-ink outline-none focus:border-ink';

  const undoTo = (prev: Plan | null) => {
    if (!meId) return;
    if (!prev) return run({ t: 'plan', plan: null }, () => setPlan(meId, null));
    const input: PlanInput = { start: prev.start, end: prev.end, destId: prev.destId };
    return run({ t: 'plan', plan: prev }, () => setPlan(meId, input, { by: prev.by, at: prev.at }));
  };

  const submit = async () => {
    if (!meId) return;
    let start: string | null = null;
    let end: string | null = null;
    if (when.startsWith('r:')) {
      const r = options.find((o) => `r:${o.start}` === when);
      if (r) [start, end] = [r.start, r.end];
    } else if (when === 'custom') {
      if (!cStart || !cEnd) return setErr('Pick a start and end date.');
      if (cEnd < cStart) return setErr('End date is before the start.');
      if (cStart < trip.start || cEnd > trip.end) return setErr('Keep the dates inside the trip window.');
      [start, end] = [cStart, cEnd];
    }
    const destId = where === 'none' ? null : where;
    if (!start && !destId) return setErr('Pick dates, a place, or both.');
    const prev = plan;
    const next: Plan = { start, end, destId, by: meId, at: new Date().toISOString() };
    onClose();
    const r = await run({ t: 'plan', plan: next }, () => setPlan(meId, { start, end, destId }));
    if (r.ok) toast(prev ? 'Plan updated.' : 'Locked in. Everyone sees the plan now.', () => undoTo(prev));
  };

  const unlock = async () => {
    if (!meId || !plan) return;
    const prev = plan;
    onClose();
    const r = await run({ t: 'plan', plan: null }, () => setPlan(meId, null));
    if (r.ok) toast('Plan unlocked.', () => undoTo(prev));
  };

  return (
    <Sheet title={plan ? 'Change the plan' : 'Lock it in'} kicker={trip.name} onClose={onClose}>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="When">
        <span className="text-xs font-bold tracking-[0.08em] text-subtle uppercase">When</span>
        {options.map((r) => (
          <Choice
            key={r.start}
            on={when === `r:${r.start}`}
            onClick={() => {
              setWhen(`r:${r.start}`);
              setErr('');
            }}
            label={r.label}
            sub={ranges.kind === 'everyone' ? `Everyone free · ${r.length} days` : `Missing ${r.missing.join(', ')} · ${r.length} days`}
          />
        ))}
        <Choice
          on={when === 'custom'}
          onClick={() => {
            setWhen('custom');
            setErr('');
          }}
          label="Other dates"
          sub={when === 'custom' && cStart && cEnd && cEnd >= cStart ? rangeLabel(dayList(cStart, cEnd)) : 'Pick any days in the window'}
        />
        {when === 'custom' && (
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-semibold tracking-[0.06em] text-subtle uppercase">From</span>
              <input type="date" min={trip.start} max={trip.end} value={cStart} onChange={(e) => setCStart(e.target.value)} className={field} />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-semibold tracking-[0.06em] text-subtle uppercase">To</span>
              <input type="date" min={trip.start} max={trip.end} value={cEnd} onChange={(e) => setCEnd(e.target.value)} className={field} />
            </label>
          </div>
        )}
        <Choice on={when === 'none'} onClick={() => setWhen('none')} label="Not yet" />
      </div>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Where">
        <span className="text-xs font-bold tracking-[0.08em] text-subtle uppercase">Where</span>
        {ranked.map((d) => {
          const vetoers = trip.people.filter((p) => p.veto === d.id);
          const n = d.approvals.length;
          return (
            <Choice
              key={d.id}
              on={where === d.id}
              onClick={() => {
                setWhere(d.id);
                setErr('');
              }}
              label={d.name}
              sub={
                `${n} ${n === 1 ? 'thumb' : 'thumbs'}` +
                (vetoers.length ? ` · vetoed by ${vetoers.map((p) => nameOf(p.id)).join(', ')}` : '')
              }
            />
          );
        })}
        {!ranked.length && <span className="text-sm text-muted">No places yet. You can lock dates now and pick the place later.</span>}
        <Choice on={where === 'none'} onClick={() => setWhere('none')} label="Not yet" />
      </div>

      {err && (
        <span role="alert" className="text-sm font-semibold text-danger">
          {err}
        </span>
      )}
      <div className="flex flex-col gap-2">
        <button onClick={submit} className="h-[54px] rounded-[14px] bg-ink text-[17px] font-bold text-surface active:scale-[0.98]">
          {plan ? 'Save plan' : 'Lock it in'}
        </button>
        {plan && (
          <button onClick={unlock} className="h-11 text-sm font-semibold text-danger underline underline-offset-[3px]">
            Unlock the plan
          </button>
        )}
        <button onClick={onClose} className="h-11 text-[15px] font-semibold text-muted">
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
