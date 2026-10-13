'use client';

import { Share } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { copyText } from '@/lib/client-store';
import { personColor, windowLabel } from '@/lib/trip-derive';
import { ActivityStrip } from './ActivityStrip';
import { CostsTab } from './CostsTab';
import { DatesTab } from './DatesTab';
import { EditTripSheet } from './EditTripSheet';
import { PlanCard } from './Plan';
import { useToast } from './toast';
import { useTrip } from './TripProvider';
import { LockIcon, LogoMark } from './ui';
import { WhereTab } from './WhereTab';

export type Tab = 'dates' | 'where' | 'costs';

const TAB_LABEL: Record<Tab, string> = { dates: 'Dates', where: 'Where', costs: 'Costs' };

export function TripHub({ initialTab }: { initialTab: Tab }) {
  const { trip, me, meId, openSheet, setSel, needMe } = useTrip();
  const [editing, setEditing] = useState(false);
  const toast = useToast();
  const [tab, setTabState] = useState<Tab>(initialTab);

  const setTab = (t: Tab) => {
    setTabState(t);
    if (t !== 'dates') setSel(null);
    const url = new URL(window.location.href);
    if (t === 'dates') url.searchParams.delete('tab');
    else url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url.pathname + url.search);
  };

  const share = async () => {
    const url = `${window.location.origin}/t/${trip.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.name, text: `Mark your free days for ${trip.name}`, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await copyText(url);
    toast('Link copied. Paste it in the group chat.');
  };

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-3.5 px-5 pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="display flex h-11 items-center gap-2 px-1 text-[17px] font-extrabold tracking-[-0.02em] text-ink no-underline hover:text-ink">
            <LogoMark size={20} />
            <span>Outward</span>
          </Link>
          <button
            onClick={share}
            className="flex h-11 items-center gap-2 rounded-full border border-ink bg-ink px-4 text-[15px] font-bold text-surface"
          >
            <Share size={16} strokeWidth={2.2} aria-hidden />
            <span>Share link</span>
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="display m-0 text-[34px] leading-[1.02] font-extrabold tracking-[-0.03em] text-balance">{trip.name}</h1>
          <span className="text-[15px] text-muted">
            {windowLabel(trip.start, trip.end, trip.people.length)} ·{' '}
            <button
              onClick={() => {
                if (needMe()) return;
                setEditing(true);
              }}
              className="p-0 text-[15px] text-muted underline underline-offset-[3px]"
            >
              Edit
            </button>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center pl-1.5">
            {trip.people.map((p) => {
              const c = personColor(p.hue);
              return (
                <span
                  key={p.id}
                  title={p.name}
                  className="-ml-1.5 flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-page text-[13px] font-bold"
                  style={{ background: c.bg, color: c.fg, boxShadow: p.id === meId ? '0 0 0 2px #1D2326' : 'none' }}
                >
                  {p.name[0]?.toUpperCase()}
                </span>
              );
            })}
          </div>
          {me && (
            <button onClick={openSheet} className="min-h-11 p-0 text-right text-sm text-muted">
              You&apos;re{' '}
              <strong className="inline-flex items-center gap-1 text-ink">
                {me.name}
                {me.locked && <LockIcon />}
              </strong>{' '}
              · <span className="underline underline-offset-[3px]">switch</span>
            </button>
          )}
        </div>
        <ActivityStrip />
        <PlanCard />
      </div>

      <div className="sticky top-0 z-[5] bg-page px-5 pt-3.5 pb-3">
        <div className="grid grid-cols-3 gap-1 rounded-[14px] bg-track p-1" role="tablist">
          {(['dates', 'where', 'costs'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-11 rounded-[11px] text-[15px] font-bold text-ink ${tab === t ? 'bg-surface shadow-tab' : 'bg-transparent'}`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === 'dates' ? <DatesTab /> : tab === 'where' ? <WhereTab /> : <CostsTab />}
      {editing && <EditTripSheet onClose={() => setEditing(false)} />}
    </div>
  );
}
