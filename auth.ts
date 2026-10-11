import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { db } from '@/lib/db';
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema';

export const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database' },
  providers: googleEnabled ? [Google] : [],
  trustHost: true,
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});

/** The signed-in user, or null. Never throws (a missing DB or secret just means signed out). */
export async function currentUser(): Promise<{ id: string; email: string | null } | null> {
  if (!googleEnabled) return null;
  try {
    const s = await auth();
    return s?.user?.id ? { id: s.user.id, email: s.user.email ?? null } : null;
  } catch {
    return null;
  }
}
