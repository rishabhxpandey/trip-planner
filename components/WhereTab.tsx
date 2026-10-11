'use client';

import { ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PUBLIC_VETOES } from '@/lib/config';
import { costOf, money, rankDests, wordCount, type Dest } from '@/lib/trip-derive';
import { useTrip } from './TripProvider';
import { PersonChip, VetoIcon } from './ui';
import { useVoting } from './useVoting';

export function vetoLabel(names: string[]) {
  if (PUBLIC_VETOES) return 'Vetoed by ' + names.join(', ');
  return names.length > 1 ? `${names.length} vetoes` : 'Vetoed';
}

export function WhereTab() {
  const { trip, me } = useTrip();
  const { add } = useVoting();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    if (await add(name, note)) {
      setName('');
      setNote('');
    }
  };

  const myVeto = me?.veto ? trip.dests.find((d) => d.id === me.veto) : undefined;
  const ranked = rankDests(trip.dests);

  return (
    <div className="flex flex-col gap-4 px-5 pt-1">
      <div className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface p-3.5">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Add a place…"
            aria-label="Add a place"
            maxLength={80}
            className="h-12 min-w-0 flex-1 rounded-xl border border-field bg-white px-3.5 text-base text-ink outline-none focus:border-ink"
          />
          <button onClick={submit} className="h-12 rounded-xl bg-ink px-[18px] text-[15px] font-bold text-surface">
            Add
          </button>
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Why? (optional)"
          aria-label="Why? (optional)"
          maxLength={280}
          className="h-[42px] rounded-[10px] border border-line bg-white px-3.5 text-[15px] text-ink outline-none focus:border-ink"
        />
      </div>
      <div className="text-[13px] text-muted">Thumbs up any you&apos;d go to. Ranked by thumbs.</div>
      <div className="flex items-center gap-2.5 rounded-xl bg-chip px-3.5 py-2.5 text-sm">
        <span className="text-danger">
          <VetoIcon size={18} strokeWidth={2.2} />
        </span>
        <span>
          {!me
            ? 'Everyone gets one veto.'
            : myVeto
              ? `Your veto is on ${myVeto.name}. Tap another to move it.`
              : "You have one veto. Use it on a place you'd skip the trip for."}
        </span>
      </div>
      {!ranked.length && (
        <div className="rounded-[18px] border-[1.5px] border-dashed border-field px-4 py-7 text-center text-[15px] text-muted">
          No ideas yet. Add the first place.
        </div>
      )}
      {ranked.map((d, i) => (
        <DestinationCard key={d.id} dest={d} rank={i + 1} />
      ))}
    </div>
  );
}

function DestinationCard({ dest: d, rank }: { dest: Dest; rank: number }) {
  const { trip, meId, me, nameOf, personOf } = useTrip();
  const { toggleUp, toggleVeto, remove } = useVoting();
  const pending = d.id.startsWith('tmp-');
  const href = pending ? '#' : `/t/${trip.id}/p/${d.id}`;
  const vetoers = trip.people.filter((p) => p.veto === d.id);
  const up = !!meId && d.approvals.includes(meId);
  const mineVeto = !!me && me.veto === d.id;
  const cost = costOf(d.pitchText);
  const hasPitch = !!d.pitchText.trim();
  const nc = d.comments.length;
  const count = d.approvals.length;

  return (
    <div
      className="flex flex-col gap-3 rounded-[18px] border bg-surface p-4"
      style={{ borderColor: vetoers.length ? '#E9B9A8' : '#E3DAC7', opacity: pending ? 0.7 : 1 }}
    >
      <div className="flex items-start gap-3">
        <span className="display w-5 pt-1 text-[15px] font-extrabold text-subtle">{rank}</span>
        <Link href={href} className="flex min-w-0 flex-1 flex-col gap-1 text-ink no-underline hover:text-ink">
          <span className="display text-[21px] leading-[1.15] font-bold tracking-[-0.015em]">{d.name}</span>
          {cost > 0 && <span className="text-sm font-bold text-teal">~{money(cost)} / person</span>}
          {d.note && <span className="text-sm leading-[1.35] text-muted">{d.note}</span>}
          <span className="text-xs text-subtle">Added by {nameOf(d.addedBy)}</span>
          {vetoers.length > 0 && (
            <span className="mt-1 flex h-[26px] items-center gap-1.5 self-start rounded-full bg-veto-bg px-2.5 text-xs font-bold text-veto-fg">
              <VetoIcon size={12} strokeWidth={2.8} />
              {vetoLabel(vetoers.map((p) => nameOf(p.id)))}
            </span>
          )}
        </Link>
        <div className="flex flex-col items-end">
          <span className="display text-[30px] leading-none font-extrabold tracking-[-0.02em]">{count}</span>
          <span className="text-[11px] font-semibold tracking-[0.06em] text-subtle uppercase">{count === 1 ? 'thumb' : 'thumbs'}</span>
        </div>
      </div>
      {count > 0 && (
        <div className="flex flex-wrap items-center gap-2 pl-8">
          {d.approvals.map((id) => {
            const p = personOf(id);
            return p ? <PersonChip key={id} name={p.name} hue={p.hue} /> : null;
          })}
        </div>
      )}
      <Link
        href={href}
        className={`ml-8 flex min-h-11 items-center justify-between gap-2.5 rounded-xl border-[1.5px] px-3.5 py-2 text-left text-ink no-underline hover:border-ink hover:text-ink ${hasPitch ? 'border-solid border-line bg-page' : 'border-dashed border-dash bg-transparent'}`}
      >
        <span className="flex min-w-0 flex-col gap-px">
          <span className="text-sm font-bold">{hasPitch ? 'See the pitch' : 'Pitch this place'}</span>
          <span className="text-xs text-muted">
            {hasPitch
              ? `${wordCount(d.pitchText)} words` +
                (nc ? ` · ${nc} ${nc === 1 ? 'comment' : 'comments'}` : '') +
                (d.pitchSource ? ` · drafted with ${d.pitchSource}` : '')
              : 'Nobody has made the case yet. Write one or draft it with AI.'}
          </span>
        </span>
        <span className="text-lg text-muted" aria-hidden>
          →
        </span>
      </Link>
      <div className="flex items-center gap-2 pl-8">
        <button
          onClick={() => toggleUp(d)}
          disabled={pending}
          aria-pressed={up}
          className={`flex h-11 items-center gap-[7px] rounded-full border-[1.5px] border-ink px-4 text-sm font-bold ${up ? 'bg-ink text-surface' : 'bg-surface text-ink'}`}
        >
          <ThumbsUp size={17} strokeWidth={2.2} aria-hidden />
          <span>{up ? "You're in" : "I'd go"}</span>
        </button>
        <button
          onClick={() => toggleVeto(d)}
          disabled={pending}
          aria-pressed={mineVeto}
          className={`flex h-11 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm font-bold ${mineVeto ? 'border-danger bg-danger text-surface' : 'border-veto-soft bg-transparent text-danger'}`}
        >
          <VetoIcon size={15} />
          <span>{mineVeto ? 'Your veto' : 'Veto'}</span>
        </button>
        <button
          onClick={() => remove(d)}
          disabled={pending}
          className="ml-auto h-11 px-1 text-[13px] font-semibold text-subtle underline underline-offset-[3px]"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
