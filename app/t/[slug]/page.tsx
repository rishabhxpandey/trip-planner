import type { Metadata } from 'next';
import { TripHub } from '@/components/TripHub';
import { loadTrip } from '@/lib/trip-data';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const trip = await loadTrip(slug).catch(() => null);
  if (!trip) return { title: 'Outward' };
  const description = `Tap the days you're free · ${trip.people.length} ${trip.people.length === 1 ? 'person' : 'people'} planning`;
  return {
    title: trip.name,
    description,
    openGraph: { title: trip.name, description, type: 'website' },
    twitter: { card: 'summary_large_image', title: trip.name, description },
  };
}

export default async function TripPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <TripHub initialTab={tab === 'where' ? 'where' : 'dates'} />;
}
