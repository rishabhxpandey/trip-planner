'use client';

import { useRouter } from 'next/navigation';
import { addDestination, removeDestination, restoreDestination, setApproval, setVeto, type DestSnapshot } from '@/lib/actions';
import type { Dest } from '@/lib/trip-derive';
import { useToast } from './toast';
import { useTrip } from './TripProvider';

/** Approve / veto / add / remove, with the toasts and undos from the spec. Shared by the Where tab and the pitch page. */
export function useVoting() {
  const { trip, me, meId, needMe, run } = useTrip();
  const toast = useToast();
  const router = useRouter();

  const toggleUp = (d: Dest) => {
    if (needMe() || !meId) return;
    const on = !d.approvals.includes(meId);
    run({ t: 'approve', pid: meId, did: d.id, on }, () => setApproval(meId, d.id, on));
  };

  const toggleVeto = (d: Dest) => {
    if (needMe() || !meId || !me) return;
    const prevId = me.veto;
    const prev = prevId ? trip.dests.find((q) => q.id === prevId) : undefined;
    const next = prevId === d.id ? null : d.id;
    const undo = () => run({ t: 'veto', pid: meId, did: prevId }, () => setVeto(meId, prevId));
    run({ t: 'veto', pid: meId, did: next }, () => setVeto(meId, next));
    if (!next) toast('Veto removed. You can use it elsewhere.');
    else if (prev) toast(`Veto moved from ${prev.name} to ${d.name}.`, undo);
    else toast(`You vetoed ${d.name}. That was your one veto.`, undo);
  };

  const remove = (d: Dest, after?: () => void) => {
    if (needMe() || !meId) return;
    const vetoers = trip.people.filter((p) => p.veto === d.id).map((p) => p.id);
    run({ t: 'remove', did: d.id }, () => removeDestination(meId, d.id)).then((r) => {
      if (!r.ok) return;
      const snap: DestSnapshot = r.snapshot;
      after?.();
      toast(`${d.name} removed.`, () =>
        run({ t: 'restore', dest: d, vetoers }, () => restoreDestination(meId, snap)),
      );
    });
  };

  const add = async (name: string, note: string): Promise<boolean> => {
    if (needMe() || !meId) return false;
    const clean = name.trim();
    if (!clean) return false;
    if (trip.dests.some((d) => d.name.toLowerCase() === clean.toLowerCase())) {
      toast(`${clean} is already on the list.`);
      return false;
    }
    const temp: Dest = {
      id: `tmp-${Date.now()}`,
      name: clean,
      note: note.trim() || null,
      addedBy: meId,
      createdAt: new Date().toISOString(),
      pitchText: '',
      pitchSource: null,
      pitchUpdatedBy: null,
      pitchUpdatedAt: null,
      approvals: [meId],
      reactions: {},
      comments: [],
    };
    const r = await run({ t: 'addDest', dest: temp }, () => addDestination(meId, clean, note));
    if (!r.ok) return false;
    toast(`Added ${clean}. Make the case for it?`, () => router.push(`/t/${trip.id}/p/${r.id}`), 'Write pitch');
    return true;
  };

  return { toggleUp, toggleVeto, remove, add };
}
