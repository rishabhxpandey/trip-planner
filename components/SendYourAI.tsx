'use client';

import { Link as LinkIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getAgentToken, rotateAgentToken } from '@/lib/actions';
import { copyText, lastAi, setLastAi } from '@/lib/client-store';
import { aiPrompt, apiDetails, parsePasted, type Dest } from '@/lib/trip-derive';
import { useToast } from './toast';
import { useTrip } from './TripProvider';

const AI_APPS = [
  { k: 'claude', name: 'Claude', sub: 'claude.ai', verified: true, url: (q: string) => 'https://claude.ai/new?q=' + encodeURIComponent(q) },
  { k: 'chatgpt', name: 'ChatGPT', sub: 'chatgpt.com', verified: true, url: (q: string) => 'https://chatgpt.com/?q=' + encodeURIComponent(q) },
  // Unverified URL format: keep the clipboard fallback.
  { k: 'muse', name: 'Muse', sub: 'by Meta', verified: false, url: (q: string) => 'https://muse.ai/?q=' + encodeURIComponent(q) },
];

export function SendYourAI({ dest: d, onPitch }: { dest: Dest; onPitch: (text: string, source: string) => void }) {
  const { trip, me, meId, needMe, ranges, run } = useTrip();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [fav, setFav] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setFav(lastAi());
    setOrigin(window.location.origin);
  }, []);

  // Fetch my token only when the panel opens (it's a secret, never in the page payload).
  useEffect(() => {
    if (!open || !meId) return;
    setToken(null);
    let live = true;
    getAgentToken(meId).then((r) => {
      if (!live) return;
      if (r.ok) setToken(r.token);
      else toast(r.error);
    });
    return () => {
      live = false;
    };
  }, [open, meId, toast]);

  const agentUrl = token ? `${origin}/api/agent/${token}` : '';
  const best = ranges.kind === 'everyone' ? ranges.ranges[0] ?? null : null;
  const prompt = () => aiPrompt({ trip, dest: d, agentUrl, best });

  const openApp = (a: (typeof AI_APPS)[number]) => {
    if (!token) return;
    const pr = prompt();
    copyText(pr);
    window.open(a.url(pr), '_blank', 'noopener');
    setLastAi(a.k);
    setFav(a.k);
    toast(a.verified ? `Opening ${a.name}. Hit send there.` : `Opening ${a.name}. If the box is empty, paste. It's copied.`);
  };

  const importPaste = () => {
    if (needMe() || !me) return;
    const raw = paste.trim();
    if (!raw) return toast('Paste your AI’s reply first.');
    const { text, author } = parsePasted(raw);
    if (!text.trim()) return toast("That reply has no pitch text. Ask your AI for only the JSON.");
    if (text.length > 8000) return toast('Keep the pitch under 8,000 characters.');
    const a = author?.trim().slice(0, 30);
    onPitch(text, `${me.name}’s AI` + (a ? ` (${a})` : ''));
    setPaste('');
    setOpen(false);
  };

  const rotate = () => {
    if (!meId) return;
    run(null, () => rotateAgentToken(meId)).then((r) => {
      if (r.ok) {
        setToken(r.token);
        toast('New AI link made. The old one stopped working.');
      }
    });
  };

  return (
    <div className="overflow-hidden rounded-[18px] bg-ink text-surface">
      <button
        onClick={() => {
          if (needMe()) return;
          setOpen(!open);
        }}
        aria-expanded={open}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left text-surface"
      >
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-accent text-ink">
          <LinkIcon size={18} strokeWidth={2.2} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="display text-[17px] font-bold">Send your AI</span>
          <span className="text-[13px] text-dk-muted">Your own Claude, ChatGPT or agent plans it and posts here</span>
        </span>
        <span className="text-lg text-dk-muted" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && me && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold tracking-[0.07em] text-dk-muted uppercase">Open your AI with the plan request ready</span>
            <span className="text-sm leading-[1.45] text-dk-text">
              Opens a new chat with everything filled in: who’s coming, the dates, and your AI link. Hit send and it plans {d.name} for{' '}
              {trip.people.length} people{best ? ` on ${best.label}` : ''}, and posts the pitch back to this page.
            </span>
            <div className="grid grid-cols-3 gap-2">
              {AI_APPS.map((a) => {
                const on = fav === a.k;
                return (
                  <button
                    key={a.k}
                    onClick={() => openApp(a)}
                    disabled={!token}
                    className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[14px] border-[1.5px] px-1.5 py-2 disabled:opacity-60 ${on ? 'border-accent bg-accent text-ink' : 'border-dk-line bg-dk-field text-surface'}`}
                  >
                    <span className="text-[15px] font-bold">{a.name}</span>
                    <span className="text-[11px] opacity-85">{on ? 'Last used' : a.sub}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                if (!token) return;
                copyText(prompt());
                toast('Instructions copied. Paste them into your AI.');
              }}
              className="h-9 self-start p-0 text-[13px] font-semibold text-dk-muted underline underline-offset-[3px]"
            >
              Using something else? Copy the instructions
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold tracking-[0.07em] text-dk-muted uppercase">Your personal AI link</span>
            <div className="flex items-center gap-2 rounded-xl border border-dk-line bg-dk-field py-1.5 pr-1.5 pl-3">
              <span className="min-w-0 flex-1 font-mono text-xs leading-[1.4] break-all text-dk-text">{agentUrl || 'Loading…'}</span>
              <button
                onClick={() => {
                  if (!agentUrl) return;
                  copyText(agentUrl);
                  toast('Your AI link is copied.');
                }}
                className="h-9 flex-none rounded-full border border-dk-line px-3 text-xs font-bold text-surface"
              >
                Copy
              </button>
            </div>
            <span className="text-xs leading-[1.4] text-dk-muted">
              Only for you. Anything posted with it shows as “{me.name}’s AI”. Treat it like a password.{' '}
              <button onClick={rotate} className="p-0 font-semibold text-dk-muted underline underline-offset-[3px]">
                Leaked? Make a new link
              </button>
            </span>
          </div>

          <div className="flex flex-col gap-2 border-t border-dk-line pt-3.5">
            <span className="text-xs font-bold tracking-[0.07em] text-dk-muted uppercase">Your AI can&apos;t post to links?</span>
            <span className="text-[13px] text-dk-muted">Paste its reply here instead.</span>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={3}
              aria-label="Paste your AI's reply"
              placeholder="Paste its JSON reply"
              className="w-full resize-y rounded-xl border border-dk-line bg-dk-field px-3.5 py-3 font-mono text-[13px] leading-[1.4] text-surface outline-none"
            />
            <button onClick={importPaste} className="h-10 self-start rounded-full bg-surface px-3.5 text-sm font-bold text-ink">
              Import reply
            </button>
          </div>

          <div className="flex flex-col gap-2 border-t border-dk-line pt-3.5">
            <button
              onClick={() => setApiOpen(!apiOpen)}
              aria-expanded={apiOpen}
              className="h-9 p-0 text-left text-xs font-bold tracking-[0.07em] text-dk-muted uppercase"
            >
              {apiOpen ? '− ' : '+ '}Endpoint details
            </button>
            {apiOpen && agentUrl && (
              <pre className="m-0 rounded-xl bg-dk-field p-3 font-mono text-xs leading-normal break-all whitespace-pre-wrap text-dk-text">
                {apiDetails(agentUrl, d.id)}
              </pre>
            )}
          </div>
          <span className="text-xs text-dk-muted">A posted plan replaces what&apos;s here. Anyone can undo it or edit afterwards.</span>
        </div>
      )}
    </div>
  );
}
