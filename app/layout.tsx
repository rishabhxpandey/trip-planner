import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { ToastProvider } from '@/components/toast';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  // Variable font: weights 500/700/800 and opsz 12-96 all come from one file.
  axes: ['opsz'],
  variable: '--font-bricolage',
  display: 'swap',
});

const instrument = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
});

function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: 'Outward',
  description: 'Outward: plan the trip, not the group chat.',
  openGraph: { title: 'Outward', description: 'Outward: plan the trip, not the group chat.' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F4EFE4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${instrument.variable}`}>
      <body>
        <ToastProvider>
          <div className="relative mx-auto min-h-screen max-w-[480px]">{children}</div>
        </ToastProvider>
        <Analytics />
      </body>
    </html>
  );
}
