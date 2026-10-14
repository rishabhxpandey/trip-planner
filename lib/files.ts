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

const BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  html: 'text/html',
  htm: 'text/html',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  svg: 'image/svg+xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ics: 'text/calendar',
  zip: 'application/zip',
};

export const extOf = (name: string) => (/\.([a-z0-9]{1,8})$/i.exec(name)?.[1] ?? '').toLowerCase();

/** The browser's type when it gave one, else a guess from the extension. */
export function typeOf(name: string, given?: string | null): string {
  const t = String(given ?? '').trim().toLowerCase();
  if (/^[a-z]+\/[a-z0-9.+-]+$/.test(t) && t !== 'application/octet-stream') return t;
  return BY_EXT[extOf(name)] ?? 'application/octet-stream';
}

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
