import { currentUser } from '@/auth';
import { CreateTripForm } from '@/components/CreateTripForm';
import { RecentTrips } from '@/components/RecentTrips';
import { LogoMark } from '@/components/ui';
import { userTripSummaries, type TripSummary } from '@/lib/trip-data';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await currentUser();
  let mine: TripSummary[] | null = null;
  if (user) mine = await userTripSummaries(user.id).catch(() => []);
  return (
    <div className="flex flex-col gap-7 px-5 pt-5 pb-12">
      <div className="display flex items-center gap-2 text-xl font-extrabold tracking-[-0.02em]">
        <LogoMark />
        <span>Outward</span>
      </div>
      <div className="flex flex-col gap-3 pt-3">
        <h1 className="display m-0 text-[46px] leading-[0.98] font-extrabold tracking-[-0.035em] text-balance">
          Plan the trip, not the group chat.
        </h1>
        <p className="m-0 text-[17px] leading-[1.45] text-pretty text-muted">
          Make a trip, drop the link in the chat. Everyone taps the days they&apos;re free and votes on where to go. No accounts.
        </p>
      </div>
      <CreateTripForm />
      <RecentTrips signedInEmail={user ? (user.email ?? 'Google') : null} mine={mine} />
    </div>
  );
}
