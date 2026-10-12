import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const trips = pgTable(
  'trips',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    windowStart: date('window_start', { mode: 'string' }).notNull(),
    windowEnd: date('window_end', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // "Lock it in": the group's decision. Dates and place can each be locked on their own.
    lockedStart: date('locked_start', { mode: 'string' }),
    lockedEnd: date('locked_end', { mode: 'string' }),
    lockedDestinationId: uuid('locked_destination_id').references((): AnyPgColumn => destinations.id, {
      onDelete: 'set null',
    }),
    lockedBy: uuid('locked_by').references((): AnyPgColumn => participants.id, { onDelete: 'set null' }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
  },
  (t) => [
    check('trips_window_check', sql`${t.windowEnd} >= ${t.windowStart} AND ${t.windowEnd} - ${t.windowStart} <= 89`),
    check(
      'trips_locked_dates_check',
      sql`(${t.lockedStart} IS NULL) = (${t.lockedEnd} IS NULL) AND (${t.lockedEnd} IS NULL OR ${t.lockedEnd} >= ${t.lockedStart})`,
    ),
  ],
);

// Auth.js tables (shape required by @auth/drizzle-adapter).
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date', withTimezone: true }),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const participants = pgTable(
  'participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    hue: smallint('hue').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    agentToken: text('agent_token').notNull().unique(),
    vetoDestinationId: uuid('veto_destination_id').references((): AnyPgColumn => destinations.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Set when someone leaves. The row stays so their comments and pitches keep an author and the name can be rejoined.
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('participants_trip_name_idx').on(t.tripId, sql`lower(${t.name})`),
    uniqueIndex('participants_trip_user_idx').on(t.tripId, t.userId),
  ],
);

export const availability = pgTable(
  'availability',
  {
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.participantId, t.day] })],
);

export const destinations = pgTable(
  'destinations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    note: text('note'),
    addedBy: uuid('added_by').references((): AnyPgColumn => participants.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    pitchText: text('pitch_text').notNull().default(''),
    pitchUpdatedBy: uuid('pitch_updated_by').references((): AnyPgColumn => participants.id, {
      onDelete: 'set null',
    }),
    pitchSource: text('pitch_source'),
    pitchUpdatedAt: timestamp('pitch_updated_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('destinations_trip_name_idx').on(t.tripId, sql`lower(${t.name})`)],
);

export const approvals = pgTable(
  'approvals',
  {
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.participantId, t.destinationId] })],
);

export const reactions = pgTable(
  'reactions',
  {
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.participantId, t.destinationId, t.emoji] }),
    check('reactions_emoji_check', sql`${t.emoji} IN ('👍', '😍', '🤔', '💸')`),
  ],
);

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  isQuestion: boolean('is_question').notNull().default(false),
  answered: boolean('answered').notNull().default(false),
  source: text('source'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
