// Per-device localStorage helpers. Every access is guarded: storage can be missing or throw.

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export const meKey = (slug: string) => `outward:me:${slug}`;
export const getMe = (slug: string) => get(meKey(slug));
export const setMeStored = (slug: string, id: string | null) => set(meKey(slug), id);

export function deviceTrips(): string[] {
  try {
    const v = JSON.parse(get('outward:trips') ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function recordTrip(slug: string) {
  set('outward:trips', JSON.stringify([slug, ...deviceTrips().filter((s) => s !== slug)].slice(0, 30)));
}

export const nudgeOff = (slug: string) => get(`outward:nudge-off:${slug}`) === '1';
export const setNudgeOff = (slug: string) => set(`outward:nudge-off:${slug}`, '1');

export const lastAi = () => get('outward:ai');
export const setLastAi = (k: string) => set('outward:ai', k);

export const inAppBrowser = () =>
  typeof navigator !== 'undefined' && /Instagram|FBAN|FBAV|Line\/|Snapchat|TikTok|WhatsApp/i.test(navigator.userAgent || '');

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const lastSeen = (slug: string) => get(`outward:seen:${slug}`);
export const setLastSeen = (slug: string, iso: string) => set(`outward:seen:${slug}`, iso);
