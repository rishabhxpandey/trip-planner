// Pure derived-data helpers shared by server and client. No imports, so it also runs under `node --test`.

export type Person = {
  id: string;
  name: string;
  hue: number;
  locked: boolean;
  veto: string | null;
  days: string[];
  joinedAt: string;
};

export type Comment = {
  id: string;
  by: string;
  text: string;
  isQuestion: boolean;
  answered: boolean;
  source: string | null;
  createdAt: string;
};

export type Dest = {
  id: string;
  name: string;
  note: string | null;
  addedBy: string | null;
  createdAt: string;
  pitchText: string;
  pitchSource: string | null;
  pitchUpdatedBy: string | null;
  pitchUpdatedAt: string | null;
  approvals: string[];
  reactions: Record<string, string[]>;
  comments: Comment[];
};

/** The group's decision ("Lock it in"). Dates and place can each be set on their own. */
export type Plan = {
  start: string | null;
  end: string | null;
  destId: string | null;
  by: string | null;
  at: string;
};

export type TripData = {
  id: string;
  name: string;
  start: string;
  end: string;
  people: Person[];
  dests: Dest[];
  plan: Plan | null;
};

export const HUES = [35, 165, 255, 330, 95, 210, 10, 290];
export const EMOJI = ['👍', '😍', '🤔', '💸'] as const;
export const MAX_WINDOW_DAYS = 90;

const DAY = 864e5;
export const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const fmtDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const fmt = (t: number, o: Intl.DateTimeFormatOptions) =>
  new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
export const shortDay = (d: string) => fmt(parseDay(d), { weekday: 'short', month: 'short', day: 'numeric' });
export const monthDay = (d: string) => fmt(parseDay(d), { month: 'short', day: 'numeric' });
export const monthLabel = (t: number) => fmt(t, { month: 'long', year: 'numeric' });
export const weekday = (d: string) => new Date(parseDay(d)).getUTCDay();
export const isWeekendish = (d: string) => [5, 6, 0].includes(weekday(d));

export function dayList(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = parseDay(start); t <= parseDay(end); t += DAY) out.push(fmtDay(t));
  return out;
}

export const spanDays = (start: string, end: string) => (parseDay(end) - parseDay(start)) / DAY;

export const peopleLabel = (n: number) => n + (n === 1 ? ' person' : ' people');

export const windowLabel = (start: string, end: string, people: number) =>
  fmt(parseDay(start), { month: 'short', day: 'numeric' }) +
  ' – ' +
  fmt(parseDay(end), { month: 'short', day: 'numeric', year: 'numeric' }) +
  ' · ' +
  peopleLabel(people);

export const shortWindowLabel = (start: string, end: string, people: number) =>
  monthDay(start) + ' – ' + monthDay(end) + ' · ' + peopleLabel(people);

export function validateWindow(name: string, start: string, end: string): string | null {
  if (!name.trim()) return 'Give the trip a name.';
  if (!start || !end) return 'Pick a start and end date.';
  const span = spanDays(start, end);
  if (Number.isNaN(span)) return 'Pick a start and end date.';
  if (span < 0) return 'End date is before the start.';
  if (span > MAX_WINDOW_DAYS - 1) return 'Keep the window to 90 days or less.';
  return null;
}

export const personColor = (hue: number) => ({
  bg: `oklch(0.86 0.07 ${hue})`,
  fg: `oklch(0.3 0.07 ${hue})`,
});

export const initialOf = (name: string) => (name.trim()[0] || '?').toUpperCase();

/* ---------- Dates: heatmap and ranges ---------- */

export type Heat = {
  active: Person[];
  pending: Person[];
  free: Record<string, string[]>;
  activeCount: number;
};

export function heatOf(trip: Pick<TripData, 'people'>): Heat {
  const active = trip.people.filter((p) => p.days.length > 0);
  const pending = trip.people.filter((p) => p.days.length === 0);
  const free: Record<string, string[]> = {};
  for (const p of active) for (const d of p.days) (free[d] ??= []).push(p.id);
  return { active, pending, free, activeCount: active.length };
}

/** Heatmap ratio for a day: free / activeCount (0 when nobody is active). */
export const ratioOf = (heat: Heat, day: string) =>
  heat.activeCount ? (heat.free[day]?.length ?? 0) / heat.activeCount : 0;

export type Range = {
  days: string[];
  start: string;
  end: string;
  label: string;
  length: number;
  missing: string[];
};

export type RangeResult = {
  kind: 'everyone' | 'closest' | 'none';
  ranges: Range[];
  emptyText: string;
};

export const rangeLabel = (days: string[]) =>
  days.length > 1 ? shortDay(days[0]) + ' – ' + shortDay(days[days.length - 1]) : shortDay(days[0]);

function runs(days: string[], test: (d: string) => boolean, minDays: number): string[][] {
  const out: string[][] = [];
  let cur: string[] | null = null;
  for (const d of days) {
    if (test(d)) (cur ??= []).push(d);
    else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out.filter((r) => r.length >= minDays);
}

export function rangesOf(trip: Pick<TripData, 'start' | 'end' | 'people'>, minDays = 2, heat = heatOf(trip)): RangeResult {
  const days = dayList(trip.start, trip.end);
  const n = heat.activeCount;
  const cnt = (d: string) => heat.free[d]?.length ?? 0;
  const mk = (r: string[]): Range => ({
    days: r,
    start: r[0],
    end: r[r.length - 1],
    label: rangeLabel(r),
    length: r.length,
    missing: heat.active.filter((p) => r.some((d) => !heat.free[d]?.includes(p.id))).map((p) => p.name),
  });
  const all = n > 0 ? runs(days, (d) => cnt(d) === n, Math.max(1, minDays)) : [];
  if (all.length) return { kind: 'everyone', ranges: all.map(mk), emptyText: '' };
  if (n < 2)
    return {
      kind: 'none',
      ranges: [],
      emptyText: n === 0 ? 'Nobody has marked days yet. Start with yours.' : 'Waiting on more people to mark their days.',
    };
  const near = runs(days, (d) => cnt(d) === n - 1, Math.max(1, minDays)).slice(0, 3);
  return {
    kind: 'closest',
    ranges: near.map(mk),
    emptyText: near.length ? '' : 'No overlap yet. Try marking a few more days.',
  };
}

/* ---------- Where: ranking ---------- */

export function rankDests<D extends Pick<Dest, 'approvals' | 'createdAt'>>(dests: D[]): D[] {
  return [...dests].sort(
    (a, b) => b.approvals.length - a.approvals.length || Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

export const vetoersOf = (trip: Pick<TripData, 'people'>, destId: string) =>
  trip.people.filter((p) => p.veto === destId);

/* ---------- Pitch parsing ---------- */

export function costOf(text: string): number {
  const m = text.match(/cost[^\n$]*\$\s?([\d,]+)/i) || text.match(/\$\s?([\d,]+)\s*(?:\/|per\s)\s*(?:person|pp|head)/i);
  return m ? parseFloat(m[1].replace(/,/g, '')) || 0 : 0;
}

export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export function locationOf(text: string): string {
  const m = text.match(/^\s*where:\s*(.+)$/im);
  return m ? m[1].replace(/https?:\/\/\S+/g, '').trim() : '';
}

export const mapUrl = (q: string) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);

export const wordCount = (text: string) => {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
};

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const URL_RE = /https?:\/\/[^\s)]+/g;

export type Block = {
  kind: 'heading' | 'line';
  lead: string;
  leadKind: 'none' | 'day' | 'bullet' | 'label';
  text: string;
  links: { url: string; host: string }[];
  gapBefore: boolean;
};

export function blocksOf(text: string): Block[] {
  const out: Block[] = [];
  let gap = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      gap = out.length > 0;
      continue;
    }
    const links = (line.match(URL_RE) || []).map((url) => ({ url, host: hostOf(url) || 'link' }));
    const body = line
      .replace(URL_RE, '')
      .replace(/\s+[–—-]\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const b: Block = { kind: 'line', lead: '', leadKind: 'none', text: body, links, gapBefore: gap };
    let m: RegExpMatchArray | null;
    if (/^#{1,3}\s/.test(body)) Object.assign(b, { kind: 'heading', text: body.replace(/^#+\s*/, '') });
    else if ((m = body.match(/^day\s*(\d+)\s*[:.\-–]\s*(.*)$/i)))
      Object.assign(b, { leadKind: 'day', lead: 'Day ' + m[1], text: m[2] });
    else if ((m = body.match(/^[-•*]\s+(.*)$/))) Object.assign(b, { leadKind: 'bullet', lead: '•', text: m[1] });
    else if ((m = body.match(/^([A-Za-z’' ]{2,24}):\s*(.*)$/)))
      Object.assign(b, { leadKind: 'label', lead: m[1], text: m[2] });
    out.push(b);
    gap = false;
  }
  return out;
}

/* ---------- Pitch input normalisation (agent API and paste-back) ---------- */

export function normPitch(o: unknown): string {
  if (typeof o === 'string') return o;
  if (!o || typeof o !== 'object') return '';
  const r = o as Record<string, unknown>;
  const inner = r.pitch;
  const t =
    r.text ??
    r.canvas ??
    (typeof inner === 'string' ? inner : inner && typeof inner === 'object' ? (inner as Record<string, unknown>).text ?? (inner as Record<string, unknown>).canvas : undefined);
  return typeof t === 'string' ? t : t == null ? '' : String(t);
}

/** Paste-back: parse the first `{…}` as JSON, else accept raw text. */
export function parsePasted(txt: string): { text: string; author?: string } {
  const a = txt.indexOf('{');
  const b = txt.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const o = JSON.parse(txt.slice(a, b + 1));
      const author = o && typeof o === 'object' && typeof o.author === 'string' ? o.author : undefined;
      return { text: normPitch(o), author };
    } catch {
      /* fall through to raw text */
    }
  }
  return { text: txt };
}

export const PITCH_SCHEMA = `{ "text": "The whole pitch as plain text. Short paragraphs plus lines like 'Where: ...', 'Stay: ... <link>', 'Getting there: ...', 'Day 1: ...', 'Cost per person: ~$000'. Put links inline." }`;

export const IDEAS = [
  { label: 'The vibe', ins: 'Why we should go: ' },
  { label: 'Where', ins: 'Where: ' },
  { label: 'Where we’d stay', ins: 'Stay: ' },
  { label: 'Getting there', ins: 'Getting there: ' },
  { label: 'Day by day', ins: 'Day 1: \nDay 2: \nDay 3: ' },
  { label: 'Must-dos', ins: '- ' },
  { label: 'Cost per person', ins: 'Cost per person: ~$' },
];

export function aiPrompt(opts: {
  trip: Pick<TripData, 'name' | 'start' | 'end' | 'people'>;
  dest: Pick<Dest, 'id' | 'name' | 'note'>;
  agentUrl: string;
  best: Range | null;
}): string {
  const { trip, dest, agentUrl, best } = opts;
  const names = trip.people.map((p) => p.name);
  const when = best
    ? 'Best dates: ' + best.label + ' (' + best.length + ' days).'
    : 'Date window: ' + trip.start + ' to ' + trip.end + '.';
  const ctx =
    'Trip: "' + trip.name + '". Destination: ' + dest.name + (dest.note ? ' (' + dest.note + ')' : '') +
    '. Group of ' + names.length + ': ' + names.join(', ') + '. ' + when;
  return (
    'Help me pitch a destination for a group trip.\n' + ctx +
    '\n\n1. GET ' + agentUrl + ' for the latest dates, people and places.' +
    '\n2. Plan the trip to ' + dest.name + ' for that group and those dates. Ask me about budget or must-dos first if you need to.' +
    '\n3. PUT the plan to ' + agentUrl + '/places/' + dest.id + '/pitch with a JSON body of { "author": "<your name, e.g. Claude>", "pitch": <plan> } where <plan> is:\n' +
    PITCH_SCHEMA +
    '\n\nRules: keep it skimmable, under 250 words. Include a "Cost per person: ~$N" line (USD, lodging split across the group) and "Day N:" lines for the plan. Only include URLs you are confident exist (search pages are fine).' +
    '\nIf you cannot make web requests, reply with only the <plan> JSON and I will paste it in.'
  );
}

export function apiDetails(agentUrl: string, destId: string): string {
  return (
    'GET  ' + agentUrl + '\n  → trip, people, best dates, places\n\nPUT  ' + agentUrl + '/places/' + destId +
    '/pitch\n  { "author": "Claude", "pitch": ' + PITCH_SCHEMA + ' }\n\nPOST ' + agentUrl +
    '/places\n  { "name": "...", "note": "...", "pitch": {…} }\n\nPOST ' + agentUrl + '/places/' + destId +
    '/comments\n  { "text": "...", "question": false }'
  );
}

/* ---------- Plan ("Lock it in") ---------- */

export const planDateLabel = (plan: Pick<Plan, 'start' | 'end'>) =>
  plan.start && plan.end ? rangeLabel(dayList(plan.start, plan.end)) : '';

/** How many active people are free on every locked day. */
export function freeForPlan(heat: Heat, plan: Pick<Plan, 'start' | 'end'>): number {
  if (!plan.start || !plan.end) return 0;
  const days = dayList(plan.start, plan.end);
  return heat.active.filter((p) => days.every((d) => heat.free[d]?.includes(p.id))).length;
}

/** Top-ranked place nobody vetoed (falls back to the top place). */
export function bestPlace(trip: Pick<TripData, 'people' | 'dests'>): Dest | null {
  const ranked = rankDests(trip.dests);
  return ranked.find((d) => !trip.people.some((p) => p.veto === d.id)) ?? ranked[0] ?? null;
}

/** All-day calendar event (DTEND is exclusive). */
export function icsFor(opts: { tripId: string; name: string; place: string | null; start: string; end: string; url: string }): string {
  const ymd = (d: string) => d.replace(/-/g, '');
  const endEx = fmtDay(parseDay(opts.end) + DAY);
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const title = opts.place ? `${opts.name}: ${opts.place}` : opts.name;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Outward//Trip planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.tripId}-${ymd(opts.start)}@outward`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(opts.start)}`,
    `DTEND;VALUE=DATE:${ymd(endEx)}`,
    `SUMMARY:${esc(title)}`,
    ...(opts.place ? [`LOCATION:${esc(opts.place)}`] : []),
    `DESCRIPTION:${esc('Planned on Outward: ' + opts.url)}`,
    `URL:${opts.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/* ---------- Activity ("What's new since you were here") ---------- */

export type ActivityItem = { at: string; text: string };

/** Things other people did after `since`, newest first. */
export function activitySince(trip: TripData, since: string, meId: string | null): ActivityItem[] {
  const t0 = Date.parse(since);
  const after = (iso: string | null | undefined) => !!iso && Date.parse(iso) > t0;
  const name = (id: string | null) => trip.people.find((p) => p.id === id)?.name ?? 'Someone';
  const out: ActivityItem[] = [];
  for (const p of trip.people) if (p.id !== meId && after(p.joinedAt)) out.push({ at: p.joinedAt, text: `${p.name} joined` });
  for (const d of trip.dests) {
    if (d.addedBy !== meId && after(d.createdAt)) out.push({ at: d.createdAt, text: `${name(d.addedBy)} added ${d.name}` });
    if (d.pitchText.trim() && d.pitchUpdatedBy !== meId && after(d.pitchUpdatedAt) && d.pitchUpdatedAt !== d.createdAt)
      out.push({ at: d.pitchUpdatedAt!, text: `${d.pitchSource ?? name(d.pitchUpdatedBy)} pitched ${d.name}` });
    const qs = d.comments.filter((c) => c.by !== meId && after(c.createdAt));
    const nq = qs.filter((c) => c.isQuestion).length;
    const nc = qs.length - nq;
    const last = qs.reduce((m, c) => (c.createdAt > m ? c.createdAt : m), '');
    if (nq) out.push({ at: last, text: `${nq} new ${nq === 1 ? 'question' : 'questions'} on ${d.name}` });
    if (nc) out.push({ at: last, text: `${nc} new ${nc === 1 ? 'comment' : 'comments'} on ${d.name}` });
  }
  if (trip.plan && trip.plan.by !== meId && after(trip.plan.at)) out.push({ at: trip.plan.at, text: `${name(trip.plan.by)} locked in the plan` });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** One-line summary of a locked plan, e.g. "Lake Tahoe · Fri, Nov 13 – Sun, Nov 15". */
export function planSummary(trip: Pick<TripData, 'plan' | 'dests'>): string {
  if (!trip.plan) return '';
  const place = trip.dests.find((d) => d.id === trip.plan!.destId)?.name;
  return [place, planDateLabel(trip.plan)].filter(Boolean).join(' · ');
}
