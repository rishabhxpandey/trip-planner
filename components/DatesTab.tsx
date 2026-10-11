'use client';

import { Lock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { setDays, toggleDay } from '@/lib/actions';
import { inAppBrowser, nudgeOff, setNudgeOff } from '@/lib/client-store';
import { WEEK_STARTS_MONDAY } from '@/lib/config';
import { dayList, fmtDay, isWeekendish, monthLabel, parseDay, personColor, shortDay } from '@/lib/trip-derive';
import { useToast } from './toast';
import { IN_APP_MSG, useTrip } from './TripProvider';
import { GoogleButton } from './ui';

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function DatesTab() {
  const { trip, me, meId, heat, ranges, mode, setMode, sel, setSel, needMe, run, googleEnabled, startGoogle } = useTrip();
  const toast = useToast();
  const [hideNudge, setHideNudge] = useState(true);
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    setHideNudge(nudgeOff(trip.id));
    setInApp(inAppBrowser());
  }, [trip.id]);

  const isMine = mode === 'mine' && !!me;
  const mine = useMemo(() => new Set(me?.days ?? []), [me]);
  const n = heat.activeCount;
  const ws = WEEK_STARTS_MONDAY ? 1 : 0;
  const weekdays = WD.slice(ws).concat(WD.slice(0, ws));

  const months = useMemo(() => {
    const s0 = parseDay(trip.start);
    const e0 = parseDay(trip.end);
    const out: { key: string; label: string; lead: number; days: { d: string; n: number; inW: boolean }[] }[] = [];
    for (let c = Date.UTC(new Date(s0).getUTCFullYear(), new Date(s0).getUTCMonth(), 1); c <= e0; ) {
      const dt = new Date(c);
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth();
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const days = [];
      for (let i = 1; i <= last; i++) {
        const t = Date.UTC(y, m, i);
        days.push({ d: fmtDay(t), n: i, inW: t >= s0 && t <= e0 });
      }
      out.push({ key: `${y}-${m}`, label: monthLabel(c), lead: (dt.getUTCDay() - ws + 7) % 7, days });
      c = Date.UTC(y, m + 1, 1);
    }
    return out;
  }, [trip.start, trip.end, ws]);

  const tapDay = (d: string) => {
    if (isMine && meId) {
      const on = !mine.has(d);
      run({ t: 'day', pid: meId, day: d, on }, () => toggleDay(meId, d, on));
    } else setSel(sel === d ? null : d);
  };

  const fillWeekends = () => {
    if (!meId || !me) return;
    const next = [...new Set([...me.days, ...dayList(trip.start, trip.end).filter(isWeekendish)])];
    run({ t: 'days', pid: meId, days: next }, () => setDays(meId, next));
  };

  const clearMine = () => {
    if (!meId || !me) return;
    const prev = me.days;
    run({ t: 'days', pid: meId, days: [] }, () => setDays(meId, [])).then(
      (r) => r.ok && toast('Cleared your days.', () => run({ t: 'days', pid: meId, days: prev }, () => setDays(meId, prev))),
    );
  };

  const goRange = (d: string) => {
    setMode('group');
    setSel(d);
  };

  const showNudge = googleEnabled && !!me && !me.locked && me.days.length > 0 && !hideNudge;
  const rangesTitle = ranges.kind === 'closest' ? 'Closest so far' : "Everyone's free";

  return (
    <div className="flex flex-col gap-5 px-5 pt-1">
      {showNudge && (
        <div className="flex flex-col gap-3 rounded-[18px] bg-teal-tint p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-teal">
              <Lock size={16} strokeWidth={2.4} className="text-surface" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="display text-[17px] font-bold">Keep your spot on every device</span>
              <span className="text-sm leading-[1.4] text-teal-ink">
                Locks “{me.name}” to you, so nobody else can pick it and your laptop knows who you are.
              </span>
            </div>
          </div>
          {inApp && <span className="rounded-[10px] bg-q-bg px-3 py-2.5 text-[13px] leading-[1.4] font-semibold text-q-fg">{IN_APP_MSG}</span>}
          <div className="flex gap-2">
            <GoogleButton label="Continue with Google" onClick={() => startGoogle('link')} className="flex-1" />
            <button
              onClick={() => {
                setNudgeOff(trip.id);
                setHideNudge(true);
              }}
              className="h-[50px] rounded-xl px-4 text-[15px] font-semibold text-teal-ink"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="display text-[19px] font-bold tracking-[-0.01em]">{rangesTitle}</span>
          <span className="text-[13px] whitespace-nowrap text-subtle">
            {n} of {trip.people.length} marked
          </span>
        </div>
        {ranges.ranges.map((g) => (
          <button
            key={g.start}
            onClick={() => goRange(g.start)}
            className={`flex min-h-[52px] items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-surface ${ranges.kind === 'everyone' ? 'bg-everyone' : 'bg-closest'}`}
          >
            <span className="flex min-w-0 flex-col gap-px">
              <span className="text-base font-bold">{g.label}</span>
              <span className="text-[13px] opacity-90">{ranges.kind === 'everyone' ? `All ${n} free` : `Missing ${g.missing.join(', ')}`}</span>
            </span>
            <span className="text-sm font-bold whitespace-nowrap">
              {g.length} {g.length === 1 ? 'day' : 'days'}
            </span>
          </button>
        ))}
        {!ranges.ranges.length && <span className="text-sm leading-[1.4] text-muted">{ranges.emptyText || 'No overlap yet.'}</span>}
        {heat.pending.length > 0 && (
          <span className="border-t border-dashed border-line pt-2.5 text-[13px] leading-[1.4] text-subtle">
            Not counted until they mark days: {heat.pending.map((p) => (p.id === meId ? 'you' : p.name)).join(', ')}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              if (needMe()) return;
              setMode('mine');
              setSel(null);
            }}
            aria-pressed={isMine}
            className={`h-11 rounded-full border-[1.5px] border-ink text-sm font-bold ${isMine ? 'bg-ink text-surface' : 'bg-transparent text-ink'}`}
          >
            My days
          </button>
          <button
            onClick={() => setMode('group')}
            aria-pressed={!isMine}
            className={`h-11 rounded-full border-[1.5px] border-ink text-sm font-bold ${!isMine ? 'bg-ink text-surface' : 'bg-transparent text-ink'}`}
          >
            Group heatmap
          </button>
        </div>
        {isMine ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted">
              {mine.size ? `${mine.size} ${mine.size === 1 ? 'day' : 'days'} marked. Saved as you tap.` : 'Tap every day you could go.'}
            </span>
            <div className="flex gap-1.5">
              <button onClick={fillWeekends} className="h-9 rounded-full border border-field bg-surface px-3 text-[13px] font-semibold text-ink">
                + Weekends
              </button>
              <button onClick={clearMine} className="h-9 rounded-full border border-field bg-surface px-3 text-[13px] font-semibold text-ink">
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3.5 text-[13px] text-muted">
            <span className="flex items-center gap-1.5">
              <span>Fewer</span>
              <span className="flex gap-0.5">
                {['oklch(0.9 0.04 190)', 'oklch(0.78 0.07 190)', 'oklch(0.62 0.09 190)', 'oklch(0.48 0.1 190)'].map((c) => (
                  <span key={c} className="h-4 w-4 rounded" style={{ background: c }} />
                ))}
              </span>
              <span>More free</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-4 w-4 rounded bg-everyone" />
              Everyone
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[5px] w-[5px] rounded-full bg-ink" />
              You
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-[22px]">
        {months.map((m) => (
          <div key={m.key} className="flex flex-col gap-2">
            <span className="display text-lg font-bold tracking-[-0.01em]">{m.label}</span>
            <div className="grid grid-cols-7 gap-[5px]">
              {weekdays.map((w, i) => (
                <span key={i} className="pb-0.5 text-center text-[11px] font-bold tracking-[0.06em] text-subtle" aria-hidden>
                  {w}
                </span>
              ))}
              {Array.from({ length: m.lead }, (_, i) => (
                <span key={`l${i}`} />
              ))}
              {m.days.map(({ d, n: num, inW }) => {
                let bg = '#FFFCF5';
                let fg = '#1D2326';
                let border = '#E3DAC7';
                let ring = 'none';
                let dot = 0;
                const k = heat.free[d]?.length ?? 0;
                if (!inW) {
                  bg = 'transparent';
                  border = 'transparent';
                  fg = '#A9A595';
                } else if (isMine) {
                  if (mine.has(d)) {
                    bg = '#1D2326';
                    fg = '#FFFCF5';
                    border = '#1D2326';
                  }
                } else {
                  if (n > 0 && k === n) {
                    bg = '#C2491C';
                    fg = '#FFFCF5';
                    border = '#C2491C';
                  } else if (k > 0) {
                    const r = k / n;
                    bg = `oklch(${(0.92 - 0.44 * r).toFixed(3)} ${(0.04 + 0.06 * r).toFixed(3)} 190)`;
                    fg = r > 0.55 ? '#FFFCF5' : '#1D2326';
                    border = 'transparent';
                  }
                  dot = mine.has(d) ? 1 : 0;
                  if (sel === d) ring = '0 0 0 2.5px #F4EFE4, 0 0 0 4.5px #1D2326';
                }
                const label = `${shortDay(d)}${inW ? (isMine ? (mine.has(d) ? ', free' : ', not marked') : `, ${k} of ${n} free`) : ''}`;
                return (
                  <button
                    key={d}
                    disabled={!inW}
                    onClick={() => tapDay(d)}
                    aria-label={label}
                    aria-pressed={isMine && inW ? mine.has(d) : undefined}
                    className="flex aspect-square min-h-11 flex-col items-center justify-center gap-[3px] rounded-[11px] border p-0 text-[15px] font-semibold transition-[background,color] duration-150"
                    style={{ background: bg, color: fg, borderColor: border, boxShadow: ring }}
                  >
                    <span>{num}</span>
                    <span className="h-[5px] w-[5px] rounded-full bg-current" style={{ opacity: dot }} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {sel && !isMine && <DayDetail day={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function DayDetail({ day, onClose }: { day: string; onClose: () => void }) {
  const { heat } = useTrip();
  const f = heat.free[day] ?? [];
  const n = heat.activeCount;
  return (
    <div className="sticky bottom-3 z-[4] flex flex-col gap-2.5 rounded-[18px] bg-ink px-4 py-3.5 text-surface shadow-float" aria-live="polite">
      <div className="flex items-center justify-between gap-2.5">
        <span className="display text-lg font-bold">{shortDay(day)}</span>
        <button onClick={onClose} aria-label="Close" className="-my-2.5 -mr-2.5 h-11 w-11 text-[22px] text-surface">
          ×
        </button>
      </div>
      <span className="text-sm">
        <strong>{n ? `${f.length} of ${n} free` : 'No one has marked days yet'}</strong>
      </span>
      <div className="flex flex-wrap gap-1.5">
        {heat.active.map((p) => {
          const free = f.includes(p.id);
          const c = personColor(p.hue);
          return (
            <span
              key={p.id}
              className="flex h-7 items-center rounded-full px-2.5 text-[13px] font-semibold"
              style={
                free
                  ? { background: c.bg, color: c.fg }
                  : { background: 'rgba(255,252,245,0.12)', color: '#B9B5A8', textDecoration: 'line-through' }
              }
            >
              {p.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}
