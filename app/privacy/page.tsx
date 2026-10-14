import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Privacy · Outward', description: 'What Outward stores and why.' };

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="October 14, 2026">
      <p>Outward helps a group pick dates and a destination for a trip. It works without an account. This page explains what it stores.</p>

      <h2>What we store</h2>
      <ul>
        <li>Trips: the name and date window you enter.</li>
        <li>The name you type when you join a trip, and the days you mark as free.</li>
        <li>Places, notes, thumbs up, vetoes, pitches, reactions and comments you add.</li>
        <li>If you choose to sign in with Google: your Google account name, email address and profile picture, so your name can be locked to you and recognised on other devices.</li>
        <li>On your own device, in your browser&apos;s local storage: which name is you on each trip, and which trips you&apos;ve opened.</li>
      </ul>

      <h2>Who can see it</h2>
      <p>Anyone with a trip&apos;s link can see that trip: its people, their marked days, places, votes, pitches and comments. Treat a trip link like a group chat invite. Your Google email is never shown to other people.</p>
      <p>Each person has a private AI link. Anything sent through it is posted to the trip under your name (&ldquo;Your name&rsquo;s AI&rdquo;). Outward never calls an AI service itself; your own AI only sees what you or it chooses to send.</p>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>No ads, no tracking pixels, no selling or sharing data with third parties.</li>
        <li>We count page views with Vercel Web Analytics, which uses no cookies and doesn&apos;t identify you. Trip links and other ids are removed before anything is counted, so it only sees things like &ldquo;a trip page was opened&rdquo;.</li>
        <li>We only use Google sign-in to identify you. We don&apos;t access your Gmail, contacts, calendar or anything else.</li>
      </ul>

      <h2>Where it lives</h2>
      <p>The app runs on Vercel and the data is stored in a Postgres database hosted by Supabase in the United States.</p>

      <h2>Deleting things</h2>
      <p>Anyone in a trip can remove places. To have a trip, your name or your Google sign-in deleted entirely, contact the person who runs this site and it will be removed.</p>
    </LegalPage>
  );
}
