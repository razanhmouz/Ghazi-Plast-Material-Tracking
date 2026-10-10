import { pgTable, text, primaryKey, timestamp, serial, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const packagingTeams = pgTable("packaging_teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const packagingTeamMembers = pgTable("packaging_team_members", {
  teamId: text("team_id").notNull().references(() => packagingTeams.id),
  userId: text("user_id").notNull().references(() => usersTable.id),
}, table => [primaryKey({ columns: [table.teamId, table.userId] })]);

// Historical identifiers deliberately have no cascading foreign keys.
// Only insert/select operations are exposed; changes and events commit together.
export const packagingAccessHistory = pgTable("packaging_access_history", {
  id: serial("id").primaryKey(),
  teamId: text("team_id"),
  documentId: text("document_id"),
  actorId: text("actor_id").notNull(),
  action: text("action", { enum: ["member_approved", "member_removed", "sharing_changed"] }).notNull(),
  memberId: text("member_id"),
  previousTeamId: text("previous_team_id"),
  nextTeamId: text("next_team_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("packaging_access_history_team_idx").on(table.teamId, table.id),
  index("packaging_access_history_document_idx").on(table.documentId, table.id),
]);
