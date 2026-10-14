import type { Metadata } from 'next';
import { FileView } from '@/components/FileView';
import { loadTrip } from '@/lib/trip-data';

export async function generateMetadata({ params }: { params: Promise<{ slug: string; fileId: string }> }): Promise<Metadata> {
  const { slug, fileId } = await params;
  const trip = await loadTrip(slug).catch(() => null);
  const file = trip?.files.find((f) => f.id === fileId);
  if (!trip || !file) return { title: 'Outward' };
  return { title: `${file.name} · ${trip.name}`, description: `A file shared on ${trip.name}.` };
}

export default async function FilePage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  return <FileView fileId={fileId} />;
}
