import type { Metadata } from 'next';
import { PitchView } from '@/components/PitchView';
import { loadTrip } from '@/lib/trip-data';

export async function generateMetadata({ params }: { params: Promise<{ slug: string; destId: string }> }): Promise<Metadata> {
  const { slug, destId } = await params;
  const trip = await loadTrip(slug).catch(() => null);
  const dest = trip?.dests.find((d) => d.id === destId);
  if (!trip || !dest) return { title: 'Outward' };
  return { title: `${dest.name} · ${trip.name}`, description: `The pitch for ${dest.name}. Vote, react and ask questions.` };
}

export default async function PitchPage({ params }: { params: Promise<{ destId: string }> }) {
  const { destId } = await params;
  return <PitchView destId={destId} />;
}
