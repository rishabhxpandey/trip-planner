'use client';

import { Download, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { fileSize, kindOf, parseCsv, safeHref, viewerOf, type TripFile } from '@/lib/files';
import { monthDay } from '@/lib/trip-derive';
import { useTrip } from './TripProvider';

/** Full-screen, in-app view of one trip file. */
export function FileView({ fileId }: { fileId: string }) {
  const { trip, nameOf } = useTrip();
  const f = trip.files.find((x) => x.id === fileId);
  const back = `/t/${trip.id}?tab=files`;

  useEffect(() => window.scrollTo(0, 0), [fileId]);

  if (!f)
    return (
      <div className="flex flex-col gap-4 px-5 pt-10">
        <h1 className="display m-0 text-[28px] font-extrabold tracking-[-0.025em]">This file was removed.</h1>
        <Link href={back} className="font-bold">
          ← All files
        </Link>
      </div>
    );

  const src = `/t/${trip.id}/files/${f.id}`;
  const btn =
    'flex h-10 flex-none items-center gap-1.5 rounded-full border border-field px-3.5 text-[13px] font-bold text-ink no-underline hover:border-ink hover:text-ink';

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex flex-col gap-3 px-5 pt-3.5">
        <Link href={back} className="flex h-11 items-center self-start px-1 text-[15px] font-semibold text-muted no-underline">
          ← {trip.name}
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="display m-0 text-[26px] leading-[1.1] font-extrabold tracking-[-0.025em] break-words">{f.name}</h1>
          <span className="text-sm text-muted">
            {kindOf(f)} · {fileSize(f.size)} · added by {nameOf(f.by)}, {monthDay(f.createdAt.slice(0, 10))}
          </span>
        </div>
        <div className="flex gap-2">
          <a href={`${src}?download=1`} className={btn}>
            <Download size={15} strokeWidth={2.2} aria-hidden />
            Download
          </a>
          {viewerOf(f) !== 'none' && (
            <a href={src} target="_blank" rel="noopener" className={btn}>
              <ExternalLink size={15} strokeWidth={2.2} aria-hidden />
              Open in new tab
            </a>
          )}
        </div>
      </div>
      <Preview file={f} src={src} />
    </div>
  );
}

function Preview({ file: f, src }: { file: TripFile; src: string }) {
  const frame = 'mx-5 overflow-hidden rounded-[14px] border border-line bg-white';
  switch (viewerOf(f)) {
    case 'pdf':
      return <PdfPages src={src} />;
    case 'image':
      return (
        <div className={`${frame} flex justify-center`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={f.name} className="block h-auto max-w-full" />
        </div>
      );
    case 'page':
      // No allow-same-origin: the page's scripts run in an opaque origin, away from this app.
      return (
        <iframe
          src={src}
          title={f.name}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads"
          className={`${frame} h-[75vh] w-[calc(100%-40px)]`}
        />
      );
    case 'csv':
      return <CsvTable src={src} />;
    case 'docx':
      return <DocxView src={src} />;
    default:
      return <NoPreview f={f} src={src} />;
  }
}

function NoPreview({ f, src, reason }: { f: Pick<TripFile, 'name' | 'type'>; src: string; reason?: string }) {
  return (
    <div className="mx-5 flex flex-col items-start gap-3 rounded-[18px] border border-dashed border-dash p-4">
      <span className="text-[15px] font-bold">{reason ?? `${kindOf(f)} files can’t be shown here.`}</span>
      <span className="text-sm text-muted">Download it to open it in the app it was made with.</span>
      <a
        href={`${src}?download=1`}
        className="flex h-11 items-center gap-2 rounded-full bg-ink px-4 text-sm font-bold text-surface no-underline hover:text-surface"
      >
        <Download size={16} strokeWidth={2.2} aria-hidden />
        Download
      </a>
    </div>
  );
}

const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <span role="status" className="mx-5 text-sm text-muted">
    {label}
  </span>
);

/** pdf.js draws every page to a canvas. Embedded PDF viewers vary (iOS Safari shows only page 1), this doesn't. */
function PdfPages({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ pages: number; done: number } | 'error' | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    (async () => {
      try {
        // The legacy build is transpiled for older mobile browsers; the modern one needs very recent JS features.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
        const task = pdfjs.getDocument({ url: src });
        destroy = () => void task.destroy();
        const doc = await task.promise;
        const el = box.current;
        if (cancelled || !el) return;
        el.replaceChildren();
        setState({ pages: doc.numPages, done: 0 });
        const width = el.clientWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = 'block w-full h-auto rounded-[10px] border border-line bg-white';
          canvas.setAttribute('aria-label', `Page ${n}`);
          el.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
          if (!cancelled) setState({ pages: doc.numPages, done: n });
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [src]);

  if (state === 'error') return <NoPreview f={{ name: '', type: 'application/pdf' }} src={src} reason="Couldn’t show this PDF." />;
  return (
    <div className="flex flex-col gap-2">
      {(!state || state.done < state.pages) && (
        <Loading label={state ? `Loading page ${state.done + 1} of ${state.pages}…` : 'Loading…'} />
      )}
      <div ref={box} className="mx-5 flex flex-col gap-3" />
    </div>
  );
}

function CsvTable({ src }: { src: string }) {
  const [rows, setRows] = useState<string[][] | 'error' | null>(null);
  useEffect(() => {
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((t) => setRows(parseCsv(t)))
      .catch(() => setRows('error'));
  }, [src]);
  if (rows === 'error') return <NoPreview f={{ name: '', type: 'text/csv' }} src={src} reason="Couldn’t show this file." />;
  if (!rows) return <Loading />;
  const [head, ...body] = rows;
  return (
    <div className="-mx-0 overflow-x-auto px-5">
      <table className="w-max min-w-full border-separate border-spacing-0 overflow-hidden rounded-[14px] border border-line bg-surface text-[13px]">
        <thead>
          <tr>
            {head?.map((h, i) => (
              <th key={i} className="border-b border-line px-3 py-2 text-left font-bold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="border-b border-line px-3 py-2 align-top whitespace-pre-wrap">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length >= 500 && <span className="mt-2 block text-xs text-subtle">Showing the first 500 rows. Download for the rest.</span>}
    </div>
  );
}

/** Word documents, laid out in the browser by docx-preview. Links that could run script are dropped. */
function DocxView({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ renderAsync }, buf] = await Promise.all([
          import('docx-preview'),
          fetch(src).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))),
        ]);
        const el = box.current;
        if (cancelled || !el) return;
        el.replaceChildren();
        await renderAsync(buf, el, undefined, { inWrapper: false, ignoreWidth: true, ignoreHeight: true, breakPages: true });
        for (const a of el.querySelectorAll('a')) {
          if (!safeHref(a.getAttribute('href'))) a.removeAttribute('href');
          else if (!a.getAttribute('href')!.startsWith('#')) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
          }
        }
        if (!cancelled) setState('ok');
      } catch (e) {
        console.error(e);
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);
  if (state === 'error') return <NoPreview f={{ name: '', type: 'application/msword' }} src={src} reason="Couldn’t show this document." />;
  return (
    <>
      {state === 'loading' && <Loading />}
      <div ref={box} className="docx-view mx-5 overflow-x-auto rounded-[14px] border border-line bg-white p-4 text-ink" />
    </>
  );
}
