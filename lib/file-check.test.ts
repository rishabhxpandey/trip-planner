import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import JSZip from 'jszip';
import { checkFile } from './file-check.ts';

const enc = (s: string) => new TextEncoder().encode(s);
const pdf = (body: string) => enc(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R ${body}>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
const pdfWithStream = (inner: string) => {
  const z = deflateSync(Buffer.from(inner));
  return Buffer.concat([Buffer.from(`%PDF-1.5\n5 0 obj<</Type/ObjStm/Filter/FlateDecode/Length ${z.length}>>stream\n`), z, Buffer.from('\nendstream endobj\n%%EOF\n')]);
};
async function office(ext: 'docx' | 'xlsx' | 'pptx', extra: Record<string, string> = {}, types = '<Types/>') {
  const z = new JSZip();
  z.file('[Content_Types].xml', types);
  z.file({ docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' }[ext], '<x/>');
  for (const [k, v] of Object.entries(extra)) z.file(k, v);
  return new Uint8Array(await z.generateAsync({ type: 'uint8array' }));
}
const ok = async (name: string, b: Uint8Array) => assert.equal((await checkFile(name, b)).ok, true, name);
const refused = async (name: string, b: Uint8Array, re: RegExp) => {
  const r = await checkFile(name, b);
  assert.equal(r.ok, false, name);
  if (!r.ok) assert.match(r.error, re, name);
};
const MZ = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0]);

test('programs, scripts and archives are refused by type', async () => {
  for (const n of ['setup.exe', 'install.msi', 'run.bat', 'x.ps1', 'a.js', 'app.apk', 'mac.dmg', 'photos.zip', 'evil.svg', 'm.docm', 'old.doc'])
    await refused(n, MZ, /can’t be uploaded/);
});

test('a program renamed to look like a document or photo is refused', async () => {
  for (const n of ['itinerary.pdf', 'photo.png', 'photo.jpg', 'notes.txt', 'plan.html', 'trip.docx', 'pic.heic']) await refused(n, MZ, /doesn’t look like/);
});

test('real files pass', async () => {
  await ok('itinerary.pdf', pdf(''));
  await ok('photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]));
  await ok('photo.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]));
  await ok('pic.heic', enc('\0\0\0\x18ftypheic\0\0\0\0'));
  await ok('plan.html', enc('<h1>Day 1</h1><script>console.log(1)</script>'));
  await ok('budget.csv', enc('﻿Item,Amount\nCabin,1400\n'));
  await ok('trip.ics', enc('BEGIN:VCALENDAR\nEND:VCALENDAR\n'));
  await ok('trip.docx', await office('docx', { 'word/_rels/document.xml.rels': '<Relationship Type="http://x/relationships/hyperlink" Target="https://a.com" TargetMode="External"/>' }));
  await ok('sheet.xlsx', await office('xlsx', { 'xl/printerSettings/printerSettings1.bin': 'x' }));
  await ok('deck.pptx', await office('pptx'));
});

test('text with binary content is refused', async () => {
  await refused('notes.txt', enc('hello\u0000world'), /doesn’t look like/);
  await refused('notes.txt', new Uint8Array([0xc3, 0x28]), /doesn’t look like/);
  await refused('trip.ics', enc('not a calendar'), /doesn’t look like/);
});

test('PDFs with scripts, launch actions or attachments are refused, even hidden', async () => {
  await refused('a.pdf', pdf('/OpenAction<</S/JavaScript/JS(app.alert(1))>>'), /scripts/);
  await refused('b.pdf', pdf('/OpenAction<</S/Launch/F(cmd.exe)>>'), /scripts/);
  await refused('c.pdf', pdf('/Names<</EmbeddedFiles 3 0 R>>'), /scripts/);
  await refused('d.pdf', pdf('/OpenAction<</S/J#61va#53cript/JS(x)>>'), /scripts/);
  await refused('e.pdf', pdfWithStream('<</S/JavaScript/JS(app.alert(1))>>'), /scripts/);
  await refused('f.pdf', pdf('/Encrypt 9 0 R'), /Encrypted/);
  await ok('g.pdf', pdfWithStream('BT /F1 12 Tf (Just text) Tj ET'));
});

test('Office files with macros, embedded objects or remote templates are refused', async () => {
  await refused('m.docx', await office('docx', { 'word/vbaProject.bin': 'x' }), /macros/);
  await refused('o.docx', await office('docx', { 'word/embeddings/oleObject1.bin': 'x' }), /macros/);
  await refused('x.xlsx', await office('xlsx', { 'xl/activeX/activeX1.xml': '<x/>' }), /macros/);
  await refused('p.pptx', await office('pptx', { 'ppt/media/payload.exe': 'MZ' }), /macros/);
  await refused('t.docx', await office('docx', { 'word/_rels/settings.xml.rels': '<Relationship Type="http://x/relationships/attachedTemplate" Target="http://evil/t.dotm" TargetMode="External"/>' }), /macros/);
  await refused('ct.docx', await office('docx', {}, '<Types><Override ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>'), /macros/);
  await refused('fake.docx', await office('xlsx'), /doesn’t look like/);
});
