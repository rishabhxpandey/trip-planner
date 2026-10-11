'use client';

import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { addComment, markAnswered, savePitch, setReaction } from '@/lib/actions';
import {
  EMOJI,
  IDEAS,
  blocksOf,
  costOf,
  initialOf,
  locationOf,
  mapUrl,
  money,
  personColor,
  type Dest,
} from '@/lib/trip-derive';
import { SendYourAI } from './SendYourAI';
import { useToast } from './toast';
import { useTrip } from './TripProvider';
import { useVoting } from './useVoting';
import { vetoLabel } from './WhereTab';

export function PitchView({ destId }: { destId: string }) {
  const { trip } = useTrip();
  const dest = trip.dests.find((d) => d.id === destId);
  const back = `/t/${trip.id}?tab=where`;

  if (!dest)
    return (
      <div className="flex flex-col gap-4 px-5 pt-10">
        <h1 className="display m-0 text-[28px] font-extrabold tracking-[-0.025em]">This place was removed.</h1>
        <Link href={back} className="font-bold">
          ← All places
        </Link>
      </div>
    );
  return <Pitch dest={dest} back={back} />;
}

function Pitch({ dest: d, back }: { dest: Dest; back: string }) {
  const { trip, me, meId, needMe, run, nameOf, personOf } = useTrip();
  const { toggleUp, toggleVeto } = useVoting();
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  useEffect(() => window.scrollTo(0, 0), [d.id]);

  // Someone's AI posted while we're looking: say so and offer undo.
  const seen = useRef({ at: d.pitchUpdatedAt, text: d.pitchText, source: d.pitchSource });
  // Time of our own last write; changes within a few seconds of it are ours, not an AI's.
  const localWrite = useRef(0);
  useEffect(() => {
    const prev = seen.current;
    seen.current = { at: d.pitchUpdatedAt, text: d.pitchText, source: d.pitchSource };
    if (Date.now() - localWrite.current < 15_000) return;
    if (d.pitchUpdatedAt !== prev.at && d.pitchSource && d.pitchText !== prev.text && d.pitchUpdatedBy) {
      const pid = meId;
      toast(
        `${d.pitchSource} drafted the pitch.`,
        pid ? () => applyPitch(prev.text, prev.source, pid) : undefined,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.pitchUpdatedAt]);

  const applyPitch = (text: string, source: string | null | undefined, pid: string) => {
    localWrite.current = Date.now();
    return run({ t: 'pitch', pid, did: d.id, text, source }, () => savePitch(pid, d.id, text, source));
  };

  /** A posted pitch replaces the text; toast with Undo restores the previous one. */
  const replacePitch = (text: string, source: string) => {
    if (!meId) return;
    const prev = { text: d.pitchText, source: d.pitchSource };
    applyPitch(text, source, meId).then((r) => {
      if (r.ok) toast(`${source} drafted the pitch.`, () => applyPitch(prev.text, prev.source, meId));
    });
  };

  const startEdit = (ins?: string) => {
    if (needMe()) return;
    const base = d.pitchText || '';
    setDraft(ins ? (base ? base.replace(/\s*$/, '') + '\n\n' : '') + ins : base);
  };

  const save = () => {
    if (!meId || draft === null) return;
    const v = draft.replace(/\s+$/, '');
    applyPitch(v, undefined, meId).then((r) => r.ok && setDraft(null));
  };

  const vetoers = trip.people.filter((p) => p.veto === d.id);
  const up = !!meId && d.approvals.includes(meId);
  const mineVeto = !!me && me.veto === d.id;
  const cost = costOf(d.pitchText);
  const loc = locationOf(d.pitchText);
  const count = d.approvals.length;
  const pitcher = nameOf(d.addedBy);
  const pitcherLabel = pitcher === 'you' ? 'You' : pitcher;
  const hasText = !!d.pitchText.trim();

  return (
    <div className="pb-[110px]">
      <div className="sticky top-0 z-[6] flex items-center justify-between gap-2 border-b border-line bg-page px-3 py-2">
        <Link href={back} className="flex h-11 items-center gap-1.5 px-2.5 text-[15px] font-bold text-ink no-underline hover:text-ink">
          ← All places
        </Link>
        <span className="truncate pr-2.5 text-[13px] text-subtle">{trip.name}</span>
      </div>

      <div className="flex flex-col gap-3.5 px-5 pt-[18px] pb-1.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold tracking-[0.07em] text-subtle uppercase">
            Pitched by {pitcherLabel}
            {d.pitchSource ? ` · drafted with ${d.pitchSource}` : ''}
          </span>
          <h1 className="display m-0 text-[38px] leading-none font-extrabold tracking-[-0.035em] text-balance">{d.name}</h1>
          {loc && (
            <a
              href={mapUrl(loc)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-8 items-center gap-1.5 self-start text-[15px] font-semibold text-teal no-underline"
            >
              <MapPin size={15} strokeWidth={2.2} aria-hidden />
              <span>{loc}</span>
            </a>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5 rounded-[14px] border border-line bg-surface px-3.5 py-3">
            <span className="display text-[26px] leading-[1.05] font-extrabold tracking-[-0.02em]">{cost ? `~${money(cost)}` : '–'}</span>
            <span className="text-xs font-semibold text-subtle">per person, est.</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-[14px] border border-line bg-surface px-3.5 py-3">
            <span className="display text-[26px] leading-[1.05] font-extrabold tracking-[-0.02em]">{count}</span>
            <span className="text-xs font-semibold text-subtle">{count === 1 ? 'person wants to go' : 'people want to go'}</span>
          </div>
        </div>
        {vetoers.length > 0 && (
          <span className="flex h-7 items-center self-start rounded-full bg-veto-bg px-3 text-[13px] font-bold text-veto-fg">
            {vetoLabel(vetoers.map((p) => nameOf(p.id)))}
          </span>
        )}
        <span className="text-[13px] text-muted">Anyone in the group can add to this.</span>
      </div>

      <div className="flex flex-col gap-3 px-5 pt-2.5">
        <div className={`flex flex-col gap-3.5 rounded-[20px] border-[1.5px] bg-surface p-[18px] ${editing ? 'border-ink' : 'border-line'}`}>
          {editing ? (
            <div className="flex flex-col gap-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                aria-label="The pitch"
                maxLength={8000}
                placeholder="Why we should go, where we'd stay, how we'd get there, a rough plan, what it costs…"
                className="min-h-[360px] w-full resize-y rounded-[14px] border border-field bg-white p-3.5 text-base leading-[1.55] text-ink outline-none"
              />
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold tracking-[0.08em] text-subtle uppercase">Add an idea</span>
                <div className="flex flex-wrap gap-1.5">
                  {IDEAS.map((i) => (
                    <button
                      key={i.label}
                      onClick={() => setDraft((s) => (s ? s.replace(/\s*$/, '') + '\n' : '') + i.ins)}
                      className="h-9 rounded-full border border-field bg-page px-3 text-[13px] font-semibold text-ink"
                    >
                      + {i.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs leading-[1.4] text-subtle">
                  Links turn into buttons. Write “Cost per person: ~$400” and it shows on the vote card.
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={save} className="h-12 flex-1 rounded-xl bg-ink text-[15px] font-bold text-surface">
                  Save
                </button>
                <button
                  onClick={() => setDraft(null)}
                  className="h-12 rounded-xl border border-field bg-surface px-[18px] text-[15px] font-semibold text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : !hasText ? (
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <span className="display text-[22px] leading-[1.15] font-bold tracking-[-0.015em] text-balance">Make the case for {d.name}</span>
                <span className="text-[15px] leading-[1.4] text-muted">One page, anything goes. Tap an idea to start, or send your AI below.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {IDEAS.map((i) => (
                  <button
                    key={i.label}
                    onClick={() => startEdit(i.ins)}
                    className="h-10 rounded-full border-[1.5px] border-dashed border-dash bg-transparent px-3.5 text-sm font-semibold text-ink hover:border-ink"
                  >
                    {i.label}
                  </button>
                ))}
              </div>
              <button onClick={() => startEdit()} className="h-[50px] rounded-[14px] bg-ink text-base font-bold text-surface">
                Start writing
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-xs font-bold tracking-[0.08em] text-subtle uppercase">
                  The pitch{d.pitchSource ? ` · via ${d.pitchSource}` : ''}
                </span>
                <button onClick={() => startEdit()} className="-my-1.5 -mr-1.5 h-9 rounded-full bg-chip px-3.5 text-[13px] font-bold text-ink">
                  Edit
                </button>
              </div>
              <PitchBlocks text={d.pitchText} />
              <Reactions dest={d} />
            </div>
          )}
        </div>

        <SendYourAI dest={d} onPitch={replacePitch} />

        <Comments dest={d} pitcher={pitcherLabel} personOf={personOf} />
      </div>

      <div
        className="fixed bottom-0 left-1/2 z-[7] flex w-full max-w-[480px] -translate-x-1/2 gap-2 px-5 pt-3 pb-5"
        style={{ background: 'linear-gradient(rgba(244,239,228,0), #F4EFE4 30%)' }}
      >
        <button
          onClick={() => toggleUp(d)}
          aria-pressed={up}
          className={`h-[52px] flex-1 rounded-full border-[1.5px] border-ink text-base font-bold shadow-vote ${up ? 'bg-ink text-surface' : 'bg-surface text-ink'}`}
        >
          {up ? "You're in" : "I'd go"}
        </button>
        <button
          onClick={() => toggleVeto(d)}
          aria-pressed={mineVeto}
          className={`h-[52px] rounded-full border-[1.5px] px-5 text-base font-bold ${mineVeto ? 'border-danger bg-danger text-surface' : 'border-veto-soft bg-page text-danger'}`}
        >
          {mineVeto ? 'Your veto' : 'Veto'}
        </button>
      </div>
    </div>
  );
}

function PitchBlocks({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {blocksOf(text).map((b, i) => {
        const linkPad = b.leadKind === 'day' ? 62 : b.leadKind === 'bullet' ? 20 : 0;
        return (
          <div key={i} className="flex flex-col gap-1.5" style={{ paddingTop: b.gapBefore ? 10 : 0 }}>
            {b.kind === 'heading' ? (
              <span className="display text-[19px] leading-[1.2] font-bold tracking-[-0.01em]">{b.text}</span>
            ) : (
              (b.text || b.lead) && (
                <div className="flex items-baseline gap-2.5">
                  {b.lead && (
                    <span
                      className="flex-none text-xs font-bold tracking-[0.06em] text-teal uppercase"
                      style={{ minWidth: b.leadKind === 'day' ? 52 : b.leadKind === 'bullet' ? 10 : 0 }}
                    >
                      {b.lead}
                    </span>
                  )}
                  {b.text && <span className="text-base leading-normal text-pretty">{b.text}</span>}
                </div>
              )
            )}
            {b.links.length > 0 && (
              <div className="flex flex-wrap gap-1.5" style={{ paddingLeft: linkPad }}>
                {b.links.map((l, j) => (
                  <a
                    key={j}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex h-[34px] items-center gap-1.5 rounded-full bg-ink px-3 text-[13px] font-bold text-surface no-underline hover:text-surface"
                  >
                    {l.host} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Reactions({ dest: d }: { dest: Dest }) {
  const { meId, needMe, run, nameOf } = useTrip();
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
      {EMOJI.map((e) => {
        const ids = d.reactions[e] ?? [];
        const on = !!meId && ids.includes(meId);
        return (
          <button
            key={e}
            title={ids.map(nameOf).join(', ') || undefined}
            aria-pressed={on}
            onClick={() => {
              if (needMe() || !meId) return;
              run({ t: 'react', pid: meId, did: d.id, emoji: e, on: !on }, () => setReaction(meId, d.id, e, !on));
            }}
            className={`flex h-9 min-w-12 items-center justify-center gap-1.5 rounded-full border-[1.5px] px-3 text-[15px] font-bold text-ink ${on ? 'border-ink bg-chip' : 'border-line bg-white'}`}
            style={{ opacity: ids.length || on ? 1 : 0.7 }}
          >
            <span>{e}</span>
            {ids.length > 0 && <span>{ids.length}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Comments({
  dest: d,
  pitcher,
  personOf,
}: {
  dest: Dest;
  pitcher: string;
  personOf: ReturnType<typeof useTrip>['personOf'];
}) {
  const { meId, needMe, run } = useTrip();
  const [text, setText] = useState('');
  const [asQ, setAsQ] = useState(false);
  const openQ = d.comments.filter((c) => c.isQuestion && !c.answered).length;

  const send = () => {
    const t = text.trim();
    if (!t || needMe() || !meId) return;
    const temp = {
      id: `tmp-${Date.now()}`,
      by: meId,
      text: t,
      isQuestion: asQ,
      answered: false,
      source: null,
      createdAt: new Date().toISOString(),
    };
    setText('');
    setAsQ(false);
    run({ t: 'comment', did: d.id, comment: temp }, () => addComment(meId, d.id, t, asQ)).then((r) => {
      if (!r.ok) setText(t);
    });
  };

  return (
    <div className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="display text-lg font-bold">Comments &amp; questions</span>
        {openQ > 0 && (
          <span className="text-[13px] text-subtle">
            {openQ} open {openQ === 1 ? 'question' : 'questions'}
          </span>
        )}
      </div>
      {!d.comments.length && <span className="text-sm text-subtle">Nothing yet. Ask the pitcher anything.</span>}
      {d.comments.map((c) => {
        const p = personOf(c.by);
        const col = personColor(p?.hue ?? 0);
        const who = c.source ? c.source : c.by === meId ? 'You' : (p?.name ?? 'Someone');
        return (
          <div key={c.id} className="flex items-start gap-2.5">
            <span
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[13px] font-bold"
              style={{ background: col.bg, color: col.fg }}
            >
              {initialOf(p?.name ?? '?')}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">{who}</span>
                {c.isQuestion && (
                  <span
                    className={`flex h-[22px] items-center rounded-full px-2 text-[11px] font-bold tracking-[0.05em] uppercase ${c.answered ? 'bg-ans-bg text-ans-fg' : 'bg-q-bg text-q-fg'}`}
                  >
                    {c.answered ? 'Answered' : 'Question'}
                  </span>
                )}
              </div>
              <span className="text-[15px] leading-[1.4] text-pretty break-words whitespace-pre-wrap">{c.text}</span>
              {c.isQuestion && !c.answered && !c.id.startsWith('tmp-') && (
                <button
                  onClick={() => {
                    if (needMe() || !meId) return;
                    run({ t: 'answer', cid: c.id }, () => markAnswered(meId, c.id));
                  }}
                  className="h-8 self-start rounded-full border border-field bg-white px-3 text-[13px] font-semibold text-ink"
                >
                  Mark answered
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={asQ ? `Ask ${pitcher} something…` : 'Add a comment…'}
            aria-label="Comment"
            maxLength={2000}
            className="h-[46px] min-w-0 flex-1 rounded-xl border border-field bg-white px-3.5 text-base text-ink outline-none focus:border-ink"
          />
          <button onClick={send} className="h-[46px] rounded-xl bg-ink px-4 text-[15px] font-bold text-surface">
            Send
          </button>
        </div>
        <button
          onClick={() => setAsQ(!asQ)}
          aria-pressed={asQ}
          className={`flex h-9 items-center gap-1.5 self-start rounded-full border-[1.5px] px-3 text-[13px] font-bold ${asQ ? 'border-q-fg bg-q-bg text-q-fg' : 'border-field bg-white text-ink'}`}
        >
          {asQ ? '✓ Asking as a question' : '? Ask as a question'}
        </button>
      </div>
    </div>
  );
}
