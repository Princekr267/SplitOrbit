import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  unique,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { groups } from './groups.js';
import { users } from './users.js';

export const people = pgTable(
  'people',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .references(() => groups.id, { onDelete: 'restrict' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }).default('').notNull(),
    note: text('note').default('').notNull(),
    isHost: boolean('is_host').default(false).notNull(),
    linkedUserId: uuid('linked_user_id').references(() => users.id, { onDelete: 'restrict' }),
    shareTokenHash: varchar('share_token_hash', { length: 255 }),
    shareEnabled: boolean('share_enabled').default(false).notNull(),
    inviteCodeHash: varchar('invite_code_hash', { length: 255 }),
    inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
    canViewAllBills: boolean('can_view_all_bills').default(true).notNull(),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique('people_id_group_id_unique').on(table.id, table.groupId),
    uniqueIndex('people_unique_host_per_group_idx')
      .on(table.groupId)
      .where(sql`${table.isHost} = true`),
    uniqueIndex('people_group_linked_user_idx')
      .on(table.groupId, table.linkedUserId)
      .where(sql`${table.linkedUserId} IS NOT NULL`),
    uniqueIndex('people_share_token_hash_idx')
      .on(table.shareTokenHash)
      .where(sql`${table.shareTokenHash} IS NOT NULL`),
    uniqueIndex('people_invite_code_hash_idx')
      .on(table.inviteCodeHash)
      .where(sql`${table.inviteCodeHash} IS NOT NULL`),
    index('people_group_id_idx').on(table.groupId),
  ]
);
