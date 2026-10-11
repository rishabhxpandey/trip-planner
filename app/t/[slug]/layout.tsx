import { notFound } from 'next/navigation';
import { currentUser, googleEnabled } from '@/auth';
import { TripProvider } from '@/components/TripProvider';
import { loadTrip, publicTrip } from '@/lib/trip-data';

export const dynamic = 'force-dynamic';

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [trip, user] = await Promise.all([loadTrip(slug), currentUser()]);
  if (!trip) notFound();
  const sessionPid = user ? (Object.entries(trip.owners).find(([, uid]) => uid === user.id)?.[0] ?? null) : null;
  return (
    <TripProvider
      data={publicTrip(trip)}
      sessionPid={sessionPid}
      signedInEmail={user?.email ?? (user ? 'your Google account' : null)}
      googleEnabled={googleEnabled}
    >
      {children}
    </TripProvider>
  );
}
