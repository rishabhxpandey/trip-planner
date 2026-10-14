// Pure helper for Vercel Web Analytics. No imports, so it runs under `node --test`.

/**
 * Strip anything that acts as a key before a page view is sent. Trip links work like invites (anyone with
 * /t/<slug> can open the trip), so slugs and ids become placeholders and the query and hash are dropped
 * (they can hold participant ids during Google sign-in).
 */
export function redactUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const path = u.pathname
    .replace(/^\/t\/[^/]+/, '/t/[trip]')
    .replace(/^(\/t\/\[trip\])\/p\/[^/]+/, '$1/p/[place]')
    .replace(/^(\/t\/\[trip\])\/f\/[^/]+/, '$1/f/[file]')
    .replace(/^(\/t\/\[trip\])\/files\/[^/]+/, '$1/files/[file]')
    .replace(/^\/api\/agent\/[^/]+/, '/api/agent/[token]');
  return `${u.origin}${path}`;
}
