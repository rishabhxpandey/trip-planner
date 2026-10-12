'use client';

import { useRouter } from 'next/navigation';
import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useOptimistic, useRef, useState } from 'react';
import { claimParticipant, googleSignIn, joinTrip, leaveTrip, linkGoogle, rejoinTrip, type Result } from '@/lib/actions';
import { getMe, inAppBrowser, recordTrip, setMeStored } from '@/lib/client-store';
import { MIN_RANGE_DAYS } from '@/lib/config';
import { applyOp, type Op } from '@/lib/ops';
import { heatOf, rangesOf, type Heat, type Person, type RangeResult, type TripData } from '@/lib/trip-derive';
import { useToast } from './toast';
import { NameSheet } from './NameSheet';

export type GoogleMode = 'link' | 'find' | 'claim';

type TripCtx = {
  trip: TripData;
  me: Person | null;
  meId: string | null;
  ready: boolean;
  heat: Heat;
  ranges: RangeResult;
  googleEnabled: boolean;
  signedInEmail: string | null;
  sessionPid: string | null;
  mode: 'mine' | 'group';
  setMode: (m: 'mine' | 'group') => void;
  sel: string | null;
  setSel: (d: string | null) => void;
  openSheet: () => void;
  /** Returns true (and opens the name sheet) when there's no identity yet. */
  needMe: () => boolean;
  run: <T extends object>(op: Op | null, call: () => Promise<Result<T>>) => Promise<Result<T>>;
  startGoogle: (mode: GoogleMode, pid?: string) => void;
  nameOf: (id: string | null) => string;
  personOf: (id: string | null) => Person | undefined;
};

const Ctx = createContext<TripCtx | null>(null);

export function useTrip() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTrip outside TripProvider');
  return c;
}

export const IN_APP_MSG = "Google doesn't allow sign-in inside this app's browser. Open the link in Safari or Chrome first.";

export function TripProvider({
  data,
  sessionPid,
  signedInEmail,
  googleEnabled,
  children,
}: {
  data: TripData;
  sessionPid: string | null;
  signedInEmail: string | null;
  googleEnabled: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [trip, apply] = useOptimistic(data, applyOp);
  const [meId, setMeId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState<'mine' | 'group'>('group');
  const [sel, setSel] = useState<string | null>(null);
  // A name created on this device may arrive a moment before the refreshed trip data does.
  const justJoined = useRef<string | null>(null);

  const me = trip.people.find((p) => p.id === meId) ?? null;
  const heat = useMemo(() => heatOf(trip), [trip]);
  const ranges = useMemo(() => rangesOf(trip, MIN_RANGE_DAYS, heat), [trip, heat]);

  const chooseMe = useCallback(
    (id: string | null) => {
      setMeId(id);
      setMeStored(trip.id, id);
      setSheet(false);
      const p = trip.people.find((q) => q.id === id);
      setMode(p && p.days.length ? 'group' : 'mine');
      setSel(null);
    },
    [trip],
  );

  // Resolve identity from this device, or from the Google session.
  useEffect(() => {
    recordTrip(data.id);
    const stored = getMe(data.id);
    const p = stored ? data.people.find((q) => q.id === stored) : undefined;
    let id: string | null = null;
    if (p && (!p.locked || p.id === sessionPid)) id = p.id;
    else if (sessionPid) id = sessionPid;
    if (id !== stored) setMeStored(data.id, id);
    setMeId(id);
    const mine = data.people.find((q) => q.id === id);
    setMode(mine && mine.days.length ? 'group' : 'mine');
    setReady(true);
    // Only on first load for this trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id]);

  // Drop an identity whose participant no longer exists.
  useEffect(() => {
    if (ready && meId && meId !== justJoined.current && !data.people.some((p) => p.id === meId)) {
      setMeId(null);
      setMeStored(data.id, null);
    }
  }, [ready, meId, data]);

  // Refresh on focus and every 20s while visible. No realtime service.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const iv = setInterval(tick, 20_000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', tick);
    };
  }, [router]);

  const run = useCallback(
    <T extends object>(op: Op | null, call: () => Promise<Result<T>>) =>
      new Promise<Result<T>>((resolve) => {
        startTransition(async () => {
          if (op) apply(op);
          try {
            const r = await call();
            if (!r.ok) toast(r.error);
            resolve(r);
          } catch {
            toast('Network hiccup. Try again.');
            resolve({ ok: false, error: 'network' });
          }
        });
      }),
    [apply, toast],
  );

  const startGoogle = useCallback(
    (mode: GoogleMode, pid?: string) => {
      if (!googleEnabled) return toast("Google sign-in isn't set up on this server yet.");
      if (inAppBrowser()) return toast(IN_APP_MSG);
      if (signedInEmail) {
        if (mode === 'link' && meId) {
          run(null, () => linkGoogle(meId)).then((r) => r.ok && toast(`Signed in. “${r.name}” is locked to you.`));
          return;
        }
        if (mode === 'find') {
          if (sessionPid) {
            chooseMe(sessionPid);
            toast(`Welcome back, ${trip.people.find((p) => p.id === sessionPid)?.name}.`);
          } else toast('Signed in. Pick your name to join this trip.');
          return;
        }
      }
      const q = mode === 'link' ? `?link=${meId}` : mode === 'claim' ? `?claim=${pid}` : '?find=1';
      startTransition(async () => {
        const r = await googleSignIn(`/t/${trip.id}${q}`);
        if (r && !r.ok) toast(r.error);
      });
    },
    [googleEnabled, signedInEmail, meId, sessionPid, trip, run, toast, chooseMe],
  );

  // Coming back from Google: finish the link / claim / find flow, then tidy the URL.
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    const link = url.searchParams.get('link');
    const claim = url.searchParams.get('claim');
    const find = url.searchParams.get('find');
    if (!link && !claim && !find) return;
    for (const k of ['link', 'claim', 'find']) url.searchParams.delete(k);
    window.history.replaceState(null, '', url.pathname + url.search);
    if (!signedInEmail) return;
    if (link) {
      run(null, () => linkGoogle(link)).then((r) => {
        if (r.ok) {
          chooseMe(link);
          toast(`Signed in. “${r.name}” is locked to you.`);
        }
      });
    } else if (claim) {
      const p = data.people.find((q) => q.id === claim);
      if (sessionPid === claim) {
        chooseMe(claim);
        toast(`Welcome back, ${p?.name}.`);
      } else {
        setSheet(true);
        toast(`That isn’t the Google account ${p?.name ?? 'they'} used.`);
      }
    } else if (sessionPid) {
      chooseMe(sessionPid);
      toast(`Welcome back, ${data.people.find((q) => q.id === sessionPid)?.name}.`);
    } else {
      setSheet(true);
      toast('Signed in. Pick your name to join this trip.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const pick = useCallback(
    async (p: Person) => {
      if (p.locked && p.id !== sessionPid) return startGoogle('claim', p.id);
      const r = await claimParticipant(p.id).catch(() => ({ ok: false as const, error: 'Network hiccup. Try again.' }));
      if (!r.ok) return toast(r.error);
      chooseMe(p.id);
    },
    [sessionPid, startGoogle, chooseMe, toast],
  );

  const join = useCallback(
    async (name: string) => {
      const r = await joinTrip(trip.id, name).catch(() => ({ ok: false as const, error: 'Network hiccup. Try again.' }));
      if (!r.ok) {
        toast(r.error);
        return false;
      }
      if (r.existing) {
        const p = trip.people.find((q) => q.id === r.id);
        if (p) await pick(p);
        else chooseMe(r.id);
        return true;
      }
      justJoined.current = r.id;
      chooseMe(r.id);
      setMode('mine');
      router.refresh();
      return true;
    },
    [trip, pick, chooseMe, toast, router],
  );

  const leave = useCallback(async () => {
    const pid = meId;
    if (!pid) return;
    const r = await run({ t: 'leave', pid }, () => leaveTrip(pid));
    if (!r.ok) return;
    setMeId(null);
    setMeStored(trip.id, null);
    setSel(null);
    const snap = r.snapshot;
    toast('You left the trip. Your days and votes were removed.', async () => {
      const u = await rejoinTrip(pid, snap).catch(() => ({ ok: false as const, error: 'Network hiccup. Try again.' }));
      if (!u.ok) return toast(u.error);
      justJoined.current = pid;
      chooseMe(pid);
      router.refresh();
    });
  }, [meId, run, trip.id, toast, chooseMe, router]);

  const needMe = useCallback(() => {
    if (me) return false;
    setSheet(true);
    return true;
  }, [me]);

  const personOf = useCallback((id: string | null) => trip.people.find((p) => p.id === id), [trip]);
  const nameOf = useCallback(
    (id: string | null) => (id && id === meId ? 'you' : (trip.people.find((p) => p.id === id)?.name ?? 'someone')),
    [trip, meId],
  );

  const value: TripCtx = {
    trip,
    me,
    meId: me ? meId : null,
    ready,
    heat,
    ranges,
    googleEnabled,
    signedInEmail,
    sessionPid,
    mode: me ? mode : 'group',
    setMode,
    sel,
    setSel,
    openSheet: () => setSheet(true),
    needMe,
    run,
    startGoogle,
    nameOf,
    personOf,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {ready && (sheet || !meId) && (
        <NameSheet
          canClose={!!me}
          onClose={() => setSheet(false)}
          onPick={pick}
          onJoin={join}
          onLeave={leave}
        />
      )}
    </Ctx.Provider>
  );
}
