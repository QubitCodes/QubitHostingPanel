import { relations, sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./identity";
import { workspaces } from "./tenancy";

/** Workspace-scoped GitHub App installation; access tokens remain short-lived and are never persisted. */
export const workspaceGithubConnections = pgTable(
  "workspace_github_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    installationId: varchar("installation_id", { length: 40 }).notNull(),
    coolifyGithubAppUuid: varchar("coolify_github_app_uuid", { length: 120 }),
    providerSyncStatus: varchar("provider_sync_status", { length: 32 })
      .notNull()
      .default("pending"),
    providerSyncError: text("provider_sync_error"),
    accountLogin: varchar("account_login", { length: 255 }).notNull(),
    accountName: varchar("account_name", { length: 255 }),
    accountType: varchar("account_type", { length: 40 }).notNull(),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deleteReason: varchar("delete_reason", { length: 500 }),
  },
  (table) => [
    uniqueIndex("workspace_github_connections_installation_active_unique")
      .on(table.installationId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("workspace_github_connections_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const workspaceGithubConnectionRelations = relations(
  workspaceGithubConnections,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceGithubConnections.workspaceId],
      references: [workspaces.id],
    }),
    createdBy: one(users, {
      fields: [workspaceGithubConnections.createdByUserId],
      references: [users.id],
    }),
  }),
);
