import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactUrl } from './analytics.ts';

test('trip slugs, ids and query strings never reach analytics', () => {
  const o = 'https://outward-dusky.vercel.app';
  assert.equal(redactUrl(`${o}/t/N1WvXyA7Ct?tab=costs`), `${o}/t/[trip]`);
  assert.equal(redactUrl(`${o}/t/N1WvXyA7Ct?claim=3d55eca6-9681-41a0-976a-58f7aac09cea`), `${o}/t/[trip]`);
  assert.equal(redactUrl(`${o}/t/N1WvXyA7Ct/p/4b0b4da6-1a53-475d-ab55-22ddfe2db776`), `${o}/t/[trip]/p/[place]`);
  assert.equal(redactUrl(`${o}/t/N1WvXyA7Ct/f/48f42cec-78b4-4402-a1c6-ec5739abced6#x`), `${o}/t/[trip]/f/[file]`);
  assert.equal(redactUrl(`${o}/`), `${o}/`);
  assert.equal(redactUrl(`${o}/privacy`), `${o}/privacy`);
  assert.equal(redactUrl('not a url'), 'not a url');
});
