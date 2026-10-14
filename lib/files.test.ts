import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedType, cleanName, disposition, fileSize, kindOf, servePolicy } from './files.ts';

test('only allowed extensions get a type, whatever the browser claims', () => {
  assert.equal(allowedType('plan.pdf'), 'application/pdf');
  assert.equal(allowedType('Trip.DOCX'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  for (const bad of ['setup.exe', 'run.bat', 'x.js', 'a.zip', 'b.svg', 'm.docm', 'old.doc', 'noext']) assert.equal(allowedType(bad), null, bad);
});

test('names: strip paths and control characters, keep the extension when trimming', () => {
  assert.equal(cleanName('C:\\Users\\me\\Itinerary "final".pdf'), 'Itinerary final.pdf');
  assert.equal(cleanName('../../etc/passwd'), 'passwd');
  assert.equal(cleanName('   '), 'file');
  const long = cleanName('a'.repeat(200) + '.pdf');
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('.pdf'));
});

test('sizes and kinds', () => {
  assert.equal(fileSize(900), '900 B');
  assert.equal(fileSize(2048), '2 KB');
  assert.equal(fileSize(1.5 * 1024 * 1024), '1.5 MB');
  assert.equal(fileSize(4 * 1024 * 1024), '4 MB');
  assert.equal(kindOf({ name: 'a.pdf', type: 'application/pdf' }), 'PDF');
  assert.equal(kindOf({ name: 'a.html', type: 'text/html' }), 'Web page');
  assert.equal(kindOf({ name: 'a.key', type: 'application/octet-stream' }), 'KEY');
});

test('serving: pages and SVGs are sandboxed, PDFs open inline, unknown types download', () => {
  assert.deepEqual(servePolicy('text/html'), { inline: true, sandbox: true });
  assert.deepEqual(servePolicy('image/svg+xml'), { inline: true, sandbox: true });
  assert.deepEqual(servePolicy('application/pdf'), { inline: true, sandbox: false });
  assert.deepEqual(servePolicy('application/zip'), { inline: false, sandbox: true });
  assert.equal(disposition('Plan é.pdf', true), `inline; filename="Plan _.pdf"; filename*=UTF-8''Plan%20%C3%A9.pdf`);
});

test('viewer picks a renderer per type', async () => {
  const { viewerOf } = await import('./files.ts');
  assert.equal(viewerOf({ name: 'a.pdf', type: 'application/pdf' }), 'pdf');
  assert.equal(viewerOf({ name: 'a.html', type: 'text/html' }), 'page');
  assert.equal(viewerOf({ name: 'a.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'docx');
  assert.equal(viewerOf({ name: 'a.heic', type: 'image/heic' }), 'none');
  assert.equal(viewerOf({ name: 'a.zip', type: 'application/zip' }), 'none');
});

test('csv parsing handles quotes, commas, CRLF and a row cap', async () => {
  const { parseCsv, safeHref } = await import('./files.ts');
  assert.deepEqual(parseCsv('Day,Plan\r\n1,"Hike, then ""tacos"""\n2,Beach'), [['Day', 'Plan'], ['1', 'Hike, then "tacos"'], ['2', 'Beach']]);
  assert.deepEqual(parseCsv('a\nb\nc\n', 2), [['a'], ['b']]);
  assert.equal(safeHref('javascript:alert(1)'), false);
  assert.equal(safeHref(' https://x.com'), true);
});
