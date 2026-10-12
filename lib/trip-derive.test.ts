import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blocksOf, costOf, locationOf, parsePasted, rangesOf, rankDests, validateWindow, type Person } from './trip-derive.ts';

const person = (id: string, days: string[]): Person => ({ id, name: id, hue: 35, locked: false, veto: null, days, joinedAt: '2026-01-01T00:00:00.000Z' });
const trip = (people: Person[]) => ({ start: '2026-11-01', end: '2026-11-10', people });

test('everyone-free ranges ignore people with no days and respect min length', () => {
  const r = rangesOf(trip([person('A', ['2026-11-02', '2026-11-03', '2026-11-05']), person('B', ['2026-11-02', '2026-11-03', '2026-11-05']), person('C', [])]), 2);
  assert.equal(r.kind, 'everyone');
  assert.deepEqual(r.ranges.map((g) => [g.start, g.end]), [['2026-11-02', '2026-11-03']]);
});

test('falls back to closest (all but one) with missing names', () => {
  const r = rangesOf(trip([person('A', ['2026-11-04', '2026-11-05']), person('B', ['2026-11-04', '2026-11-05']), person('C', ['2026-11-09'])]), 2);
  assert.equal(r.kind, 'closest');
  assert.deepEqual(r.ranges[0].missing, ['C']);
});

test('ranking: approvals desc then created asc', () => {
  const d = (id: string, n: number, t: string) => ({ id, approvals: Array(n).fill('x'), createdAt: t });
  assert.deepEqual(rankDests([d('a', 1, '2026-01-01'), d('b', 2, '2026-01-03'), d('c', 2, '2026-01-02')]).map((x) => x.id), ['c', 'b', 'a']);
});

test('cost and location parsing', () => {
  assert.equal(costOf('Cost per person: ~$1,372 (cabin)'), 1372);
  assert.equal(costOf('About $190 / person'), 190);
  assert.equal(costOf('no money here'), 0);
  assert.equal(locationOf('Hi\nWhere: South Lake Tahoe, CA https://x.com\n'), 'South Lake Tahoe, CA');
});

test('pitch blocks', () => {
  const b = blocksOf('# Plan\nDay 1: Hike https://www.airbnb.com/s/x\n\n- Snacks\nStay: Cabin');
  assert.deepEqual(b.map((x) => [x.kind, x.leadKind, x.text]), [
    ['heading', 'none', 'Plan'],
    ['line', 'day', 'Hike'],
    ['line', 'bullet', 'Snacks'],
    ['line', 'label', 'Cabin'],
  ]);
  assert.equal(b[1].links[0].host, 'airbnb.com');
  assert.equal(b[2].gapBefore, true);
});

test('paste-back accepts JSON or raw text', () => {
  assert.deepEqual(parsePasted('Sure! {"author":"GPT","pitch":{"text":"Go"}} enjoy'), { text: 'Go', author: 'GPT' });
  assert.deepEqual(parsePasted('just text'), { text: 'just text' });
});

test('window validation', () => {
  assert.equal(validateWindow('', '2026-01-01', '2026-01-02'), 'Give the trip a name.');
  assert.equal(validateWindow('x', '2026-01-05', '2026-01-02'), 'End date is before the start.');
  assert.equal(validateWindow('x', '2026-01-01', '2026-03-31'), null);
  assert.equal(validateWindow('x', '2026-01-01', '2026-04-01'), 'Keep the window to 90 days or less.');
});

import { activitySince, bestPlace, freeForPlan, heatOf, icsFor, type Dest, type TripData } from './trip-derive.ts';

const dest = (id: string, approvals: string[], extra: Partial<Dest> = {}): Dest => ({
  id, name: id, note: null, addedBy: 'A', createdAt: '2026-01-01T00:00:00.000Z', pitchText: '', pitchSource: null,
  pitchUpdatedBy: null, pitchUpdatedAt: null, approvals, reactions: {}, comments: [], ...extra,
});

test('best place skips vetoed', () => {
  const people = [{ ...person('A', []), veto: 'top' }, person('B', [])];
  assert.equal(bestPlace({ people, dests: [dest('top', ['A', 'B']), dest('next', ['A'])] })?.id, 'next');
});

test('free for plan counts people free every locked day', () => {
  const h = heatOf({ people: [person('A', ['2026-11-02', '2026-11-03']), person('B', ['2026-11-02'])] });
  assert.equal(freeForPlan(h, { start: '2026-11-02', end: '2026-11-03' }), 1);
});

test('ics is an all-day event with exclusive end', () => {
  const ics = icsFor({ tripId: 't1', name: 'Trip, yay', place: 'Tahoe', start: '2026-11-13', end: '2026-11-15', url: 'https://x/t/t1' });
  assert.match(ics, /DTSTART;VALUE=DATE:20261113\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261116\r\n/);
  assert.match(ics, /SUMMARY:Trip\\, yay: Tahoe/);
});

test('activity lists others since last visit, not mine', () => {
  const since = '2026-02-01T00:00:00.000Z';
  const later = '2026-02-02T00:00:00.000Z';
  const trip: TripData = {
    id: 't', name: 't', start: '2026-11-01', end: '2026-11-30', plan: { start: null, end: null, destId: 'x', by: 'B', at: later },
    people: [{ ...person('A', []), joinedAt: '2026-01-01T00:00:00.000Z' }, { ...person('B', []), joinedAt: later }],
    dests: [
      dest('mine', [], { addedBy: 'A', createdAt: later }),
      dest('x', [], { addedBy: 'B', createdAt: later, comments: [{ id: 'c', by: 'B', text: '?', isQuestion: true, answered: false, source: null, createdAt: later }] }),
    ],
  };
  const texts = activitySince(trip, since, 'A').map((i) => i.text).sort();
  assert.deepEqual(texts, ['1 new question on x', 'B added x', 'B joined', 'B locked in the plan']);
});
