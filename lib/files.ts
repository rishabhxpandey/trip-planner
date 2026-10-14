// Trip files: pure helpers shared by server and client. No imports, so it runs under `node --test`.

export type TripFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  by: string | null;
  createdAt: string;
};

/** Vercel caps a function request body at 4.5 MB, so uploads stay under that. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_FILES_PER_TRIP = 40;

/**
 * The only file types a trip accepts, by extension. Everything else (programs, scripts, installers, archives,
 * macro-enabled and old binary Office formats, SVG) is refused. The server also checks each file's bytes
 * match its extension and have no active content (lib/file-check.ts), so renaming a program doesn't get it in.
 */
export const ALLOWED: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  ics: 'text/calendar',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** For the file picker and the "what can I upload" line. */
export const ACCEPT = Object.keys(ALLOWED).map((e) => `.${e}`).join(',');
export const ALLOWED_LABEL = 'PDFs, photos, Word, Excel, PowerPoint, web pages, text, CSV and calendar files';

export const extOf = (name: string) => (/\.([a-z0-9]{1,8})$/i.exec(name)?.[1] ?? '').toLowerCase();

/** The type for an allowed file name, or null when that kind of file isn't accepted. Never trusts the browser's type. */
export const allowedType = (name: string): string | null => ALLOWED[extOf(name)] ?? null;

/** Keep the name readable but safe for headers and storage: no paths, no control characters, max 120 chars. */
export function cleanName(raw: string): string {
  const base = String(raw ?? '').split(/[\\/]/).pop() ?? '';
  const s = base.replace(/[\u0000-\u001f\u007f"]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return 'file';
  if (s.length <= 120) return s;
  const ext = extOf(s);
  return ext ? `${s.slice(0, 119 - ext.length)}.${ext}` : s.slice(0, 120);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

/** A short label for the file list: "PDF", "Web page", "Image", or the extension. */
export function kindOf(f: Pick<TripFile, 'name' | 'type'>): string {
  if (f.type === 'application/pdf') return 'PDF';
  if (f.type === 'text/html') return 'Web page';
  if (f.type.startsWith('image/')) return 'Image';
  if (f.type.includes('wordprocessingml') || f.type === 'application/msword') return 'Word doc';
  if (f.type.includes('spreadsheetml') || f.type === 'application/vnd.ms-excel' || f.type === 'text/csv') return 'Spreadsheet';
  if (f.type.includes('presentationml') || f.type === 'application/vnd.ms-powerpoint') return 'Slides';
  if (f.type.startsWith('text/')) return 'Text';
  return extOf(f.name).toUpperCase() || 'File';
}

/**
 * How the download route serves a file. Types browsers show well open in the tab; everything else downloads.
 * Anything that can run script (HTML, SVG) gets a CSP sandbox so it runs in an opaque origin and can't
 * touch the app's cookies or call its actions. PDFs skip the sandbox because Chrome won't render a sandboxed PDF.
 */
export function servePolicy(type: string): { inline: boolean; sandbox: boolean } {
  if (type === 'application/pdf') return { inline: true, sandbox: false };
  if (/^image\/(png|jpeg|gif|webp)$/.test(type)) return { inline: true, sandbox: false };
  if (type === 'text/html' || type === 'image/svg+xml') return { inline: true, sandbox: true };
  if (/^text\/(plain|markdown|csv)$/.test(type)) return { inline: true, sandbox: true };
  return { inline: false, sandbox: true };
}

/** RFC 6266 Content-Disposition with a plain fallback and a UTF-8 name. */
export function disposition(name: string, inline: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export type Viewer = 'pdf' | 'image' | 'page' | 'csv' | 'docx' | 'none';

/** How the in-app viewer shows a file. 'page' is a sandboxed frame (HTML, plain text); 'none' offers a download. */
export function viewerOf(f: Pick<TripFile, 'name' | 'type'>): Viewer {
  if (f.type === 'application/pdf') return 'pdf';
  if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) return 'image';
  if (f.type === 'text/csv') return 'csv';
  if (f.type === 'text/html' || f.type === 'text/plain' || f.type === 'text/markdown') return 'page';
  if (f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  return 'none';
}

/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, CRLF. Stops after `maxRows`. */
export function parseCsv(text: string, maxRows = 500): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if ((cell || row.length) && rows.length < maxRows) rows.push([...row, cell]);
  return rows;
}

/** Only links that can't run script survive in a rendered document. */
export const safeHref = (href: string | null) => !!href && /^(https?:|mailto:|tel:|#)/i.test(href.trim());
