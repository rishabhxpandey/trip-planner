// Server-side upload checks: is this file really what its name says, and does it carry anything that can run?
// Used by uploadFile in lib/actions.ts. Node-only (zlib, jszip).

import JSZip from 'jszip';
import { inflateSync } from 'node:zlib';
import { allowedType, extOf, ALLOWED_LABEL } from './files.ts';

export type Check = { ok: true; type: string } | { ok: false; error: string };

const no = (error: string): Check => ({ ok: false, error });
const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** Check an upload. Returns the type to store, or a message saying why it was refused. */
export async function checkFile(name: string, bytes: Uint8Array): Promise<Check> {
  const type = allowedType(name);
  const ext = extOf(name);
  if (!type) return no(`${ext ? `.${ext} files` : 'Files without an extension'} can’t be uploaded. You can add ${ALLOWED_LABEL}.`);
  if (!bytes.length) return no('That file is empty.');
  const mismatch = no(`That file doesn’t look like a real .${ext} file, so it wasn’t uploaded.`);

  if (type === 'application/pdf') return checkPdf(bytes, mismatch);
  if (type === 'image/png') return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? { ok: true, type } : mismatch;
  if (type === 'image/jpeg') return startsWith(bytes, [0xff, 0xd8, 0xff]) ? { ok: true, type } : mismatch;
  if (type === 'image/gif') return /^GIF8[79]a$/.test(ascii(bytes, 0, 6)) ? { ok: true, type } : mismatch;
  if (type === 'image/webp') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP' ? { ok: true, type } : mismatch;
  if (type === 'image/heic' || type === 'image/heif')
    return ascii(bytes, 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(bytes, 8, 12))
      ? { ok: true, type }
      : mismatch;
  if (type.startsWith('text/')) return checkText(bytes, type, mismatch);
  return checkOffice(bytes, type, ext, mismatch);
}

/* ---------- Text (txt, md, csv, html, ics) ---------- */

function checkText(bytes: Uint8Array, type: string, mismatch: Check): Check {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return mismatch;
  }
  // Real text never has NUL bytes; binaries (programs included) almost always do.
  if (text.includes('\u0000')) return mismatch;
  if (type === 'text/calendar' && !/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) return mismatch;
  return { ok: true, type };
}

/* ---------- PDF ---------- */

// Actions that run code, open other programs, or carry other files inside the PDF.
const PDF_ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|GoToE|ImportData|SubmitForm)(?![A-Za-z0-9])/;
const MAX_INFLATED = 64 * 1024 * 1024;

/** PDF names can hide letters as #xx escapes (/J#61vaScript); decode them before matching. */
const decodeNames = (s: string) => s.replace(/\/[^\s/<>[\]()]+/g, (n) => n.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));

function checkPdf(bytes: Uint8Array, mismatch: Check): Check {
  const head = ascii(bytes, 0, Math.min(bytes.length, 1024));
  if (!head.includes('%PDF-')) return mismatch;
  const raw = Buffer.from(bytes).toString('latin1');
  const active = () => no('That PDF has scripts, attachments or actions that open other programs, so it wasn’t uploaded. Print or export it to a new PDF and try again.');

  if (/\/Encrypt(?![A-Za-z0-9])/.test(decodeNames(raw)))
    return no('Encrypted or password-protected PDFs can’t be checked, so they can’t be uploaded. Print or export it to a new PDF and try again.');
  if (PDF_ACTIVE.test(decodeNames(raw))) return active();

  // Look inside compressed streams too (object streams can hold the same keys).
  let total = 0;
  const re = /stream\r?\n/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    re.lastIndex = end;
    let out: Buffer;
    try {
      out = inflateSync(Buffer.from(bytes.subarray(start, end)), { maxOutputLength: MAX_INFLATED - total });
    } catch {
      continue; // Not Flate (images, fonts) or not compressed: already covered by the raw scan.
    }
    total += out.length;
    if (total >= MAX_INFLATED) return no('That PDF expands to far more than its size, so it wasn’t uploaded.');
    if (PDF_ACTIVE.test(decodeNames(out.toString('latin1')))) return active();
  }
  return { ok: true, type: 'application/pdf' };
}

/* ---------- Word, Excel, PowerPoint (.docx, .xlsx, .pptx) ---------- */

const MAIN_PART: Record<string, string> = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' };
const RISKY_EXT = /\.(exe|dll|com|scr|pif|cpl|msi|msp|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|jar|lnk|reg|sh|app|dmg|pkg|apk|iso|img)$/i;
// Remote templates, OLE objects and frames are known ways Office files fetch or run code.
const RISKY_REL = /Type="[^"]*\/(attachedTemplate|oleObject|frame|subDocument|package|control)"/i;
const MAX_ENTRIES = 3000;
const MAX_UNZIPPED = 80 * 1024 * 1024;

async function checkOffice(bytes: Uint8Array, type: string, ext: string, mismatch: Check): Promise<Check> {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return mismatch;
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: false });
  } catch {
    return mismatch;
  }
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ENTRIES) return mismatch;
  const names = entries.map((e) => e.name);
  if (!names.includes('[Content_Types].xml') || !names.includes(MAIN_PART[ext])) return mismatch;

  const macros = no('That file has macros or embedded programs, so it wasn’t uploaded. Save it as a regular .docx, .xlsx or .pptx without macros and try again.');
  if (names.some((n) => /vbaProject\.bin$|vbaData\.xml$|(^|\/)activeX\/|(^|\/)embeddings\//i.test(n) || RISKY_EXT.test(n))) return macros;

  // Unzipped size from the zip's own records, so a tiny "zip bomb" is refused before anything is read.
  const unzipped = entries.reduce((a, e) => a + ((e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
  if (unzipped > MAX_UNZIPPED) return no('That file expands to far more than its size, so it wasn’t uploaded.');

  const types = await zip.file('[Content_Types].xml')!.async('string');
  if (/macroEnabled|vbaProject|oleObject|activeX/i.test(types)) return macros;
  for (const e of entries) {
    if (!e.name.endsWith('.rels')) continue;
    if (RISKY_REL.test(await e.async('string'))) return macros;
  }
  return { ok: true, type };
}
