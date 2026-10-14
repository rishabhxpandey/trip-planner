'use client';

import { Analytics } from '@vercel/analytics/next';
import { redactUrl } from '@/lib/analytics';

/** Vercel Web Analytics (cookieless page views), with trip links and ids redacted before anything is sent. */
export function SiteAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: redactUrl(event.url) })} />;
}
