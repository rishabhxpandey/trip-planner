import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Terms · Outward', description: 'The terms for using Outward.' };

export default function Terms() {
  return (
    <LegalPage title="Terms" updated="October 11, 2026">
      <p>Outward is a free tool for planning a trip with friends. By using it you agree to these terms.</p>

      <h2>Using Outward</h2>
      <ul>
        <li>Anyone with a trip link can view and edit that trip. Only share links with people you want planning with you.</li>
        <li>Don&apos;t post anything illegal, abusive, or that you don&apos;t have the right to share.</li>
        <li>Don&apos;t try to break, overload or misuse the service, including the AI link API.</li>
      </ul>

      <h2>Your content</h2>
      <p>You keep ownership of what you post. You let Outward store and show it to the people on your trip so the app can work.</p>

      <h2>No guarantees</h2>
      <p>Outward is provided as is, without warranties. Prices, links and plans in pitches (including ones written by AI) may be wrong; check before you book. We aren&apos;t responsible for bookings, costs or decisions made using the app, and the service may change or stop at any time.</p>

      <h2>Changes</h2>
      <p>These terms may be updated. Continuing to use Outward after a change means you accept the new terms.</p>
    </LegalPage>
  );
}
