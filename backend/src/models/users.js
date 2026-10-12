import { pgTable, uuid, varchar, text, boolean, timestamp, integer, pgEnum, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    username: varchar('username', { length: 20 }).notNull(),
    email: varchar('email', { length: 254 }),
    phone: varchar('phone', { length: 20 }),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: userRoleEnum('role').default('user').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    tokenVersion: integer('token_version').default(0).notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    passwordChangeNoticePending: boolean('password_change_notice_pending').default(false).notNull(),
    passwordChangeMethod: varchar('password_change_method', { length: 20 }),
    avatarColor: varchar('avatar_color', { length: 20 }).default('indigo').notNull(),
    upiId: varchar('upi_id', { length: 256 }),
    showUpi: boolean('show_upi').default(false).notNull(),
    defaultPaymentMode: varchar('default_payment_mode', { length: 20 }).default('online').notNull(),
    defaultSplitType: varchar('default_split_type', { length: 20 }).default('equal').notNull(),
    deactivatedReason: text('deactivated_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('users_username_idx').on(table.username),
    check(
      'users_username_format_check',
      sql`${table.username} = lower(${table.username}) AND ${table.username} ~ '^[a-z][a-z0-9_]{2,19}$'`
    ),
  ]
);
