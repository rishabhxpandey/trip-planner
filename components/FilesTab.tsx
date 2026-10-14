'use client';

import { Download, File as FileIcon, FileCode, FileImage, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { removeFile, uploadFile } from '@/lib/actions';
import { ACCEPT, ALLOWED_LABEL, MAX_FILE_BYTES, allowedType, extOf, fileSize, kindOf, type TripFile } from '@/lib/files';
import { monthDay } from '@/lib/trip-derive';
import { useToast } from './toast';
import { useTrip } from './TripProvider';

function Icon({ file }: { file: TripFile }) {
  const kind = kindOf(file);
  const C =
    kind === 'PDF' || kind === 'Word doc' || kind === 'Text'
      ? FileText
      : kind === 'Image'
        ? FileImage
        : kind === 'Web page'
          ? FileCode
          : kind === 'Spreadsheet'
            ? FileSpreadsheet
            : FileIcon;
  return (
    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-chip text-ink">
      <C size={20} strokeWidth={2} aria-hidden />
    </span>
  );
}

export function FilesTab() {
  const { trip, meId, needMe, nameOf, run } = useTrip();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const pick = () => {
    if (needMe()) return;
    input.current?.click();
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length || !meId) return;
    const files = [...list];
    if (input.current) input.current.value = '';
    let done = 0;
    for (const f of files) {
      if (!allowedType(f.name)) {
        toast(`${extOf(f.name) ? `.${extOf(f.name)} files` : `${f.name}`} can’t be uploaded. You can add ${ALLOWED_LABEL}.`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast(`${f.name} is over ${fileSize(MAX_FILE_BYTES)}. Try a smaller one or share a link.`);
        continue;
      }
      setBusy(files.length > 1 ? `Uploading ${f.name} (${done + 1} of ${files.length})…` : `Uploading ${f.name}…`);
      const form = new FormData();
      form.set('participantId', meId);
      form.set('file', f);
      const r = await uploadFile(form).catch(() => ({ ok: false as const, error: 'Upload failed. Check your connection and try again.' }));
      if (!r.ok) toast(r.error);
      else done++;
    }
    setBusy(null);
    if (done) toast(done === 1 ? 'Uploaded. Everyone on the trip can open it.' : `Uploaded ${done} files.`);
  };

  const remove = async (f: TripFile) => {
    if (needMe() || !meId) return;
    const r = await run({ t: 'removeFile', id: f.id }, () => removeFile(meId, f.id));
    if (r.ok) toast(`${f.name} removed.`, () => run({ t: 'restoreFile', file: f }, () => removeFile(meId, f.id, true)));
  };

  return (
    <div className="flex flex-col gap-4 px-5 pt-1">
      <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
        {!trip.files.length && (
          <>
            <span className="display text-[21px] leading-[1.15] font-bold tracking-[-0.015em]">Keep the plan in one place</span>
            <span className="text-sm leading-[1.4] text-muted">
              Upload the itinerary, booking confirmations, tickets, or a plan page: {ALLOWED_LABEL}, up to{' '}
              {fileSize(MAX_FILE_BYTES)} each. Every file is checked, and anything that could run code is refused.
              Anyone with the trip link can open them.
            </span>
          </>
        )}
        <button
          onClick={pick}
          disabled={!!busy}
          className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-ink text-base font-bold text-surface active:scale-[0.98] disabled:opacity-70"
        >
          <Upload size={18} strokeWidth={2.4} aria-hidden />
          {busy ? 'Uploading…' : 'Upload a file'}
        </button>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
        {busy && (
          <span role="status" className="truncate text-[13px] text-muted">
            {busy}
          </span>
        )}
        {!!trip.files.length && !busy && (
          <span className="text-[13px] text-muted">
            {ALLOWED_LABEL}, up to {fileSize(MAX_FILE_BYTES)} each. Files that could run code are refused.
          </span>
        )}
      </div>

      {!!trip.files.length && (
        <div className="flex flex-col divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface">
          {trip.files.map((f) => {
            const href = `/t/${trip.id}/files/${f.id}`;
            const view = `/t/${trip.id}/f/${f.id}`;
            return (
              <div key={f.id} className="flex items-center gap-3 px-3.5 py-3">
                <Icon file={f} />
                <Link href={view} className="flex min-w-0 flex-1 flex-col gap-0.5 text-ink no-underline hover:text-ink">
                  <span className="truncate text-[15px] font-bold">{f.name}</span>
                  <span className="truncate text-[13px] text-muted">
                    {kindOf(f)} · {fileSize(f.size)} · {nameOf(f.by)}, {monthDay(f.createdAt.slice(0, 10))}
                  </span>
                </Link>
                <a
                  href={`${href}?download=1`}
                  aria-label={`Download ${f.name}`}
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-field text-ink hover:border-ink hover:text-ink"
                >
                  <Download size={17} strokeWidth={2.2} aria-hidden />
                </a>
                <button
                  onClick={() => remove(f)}
                  className="h-10 flex-none px-1 text-[13px] font-semibold text-subtle underline underline-offset-[3px]"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
