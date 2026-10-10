import { pgTable, text, primaryKey, timestamp } from "drizzle-orm/pg-core";
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
