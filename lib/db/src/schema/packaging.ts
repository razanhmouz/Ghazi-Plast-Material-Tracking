import { packagingTeams } from "./packaging-teams";
import { pgTable, text, boolean, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";

export const packagingBatches = pgTable("packaging_batches", {
  id: text("id").primaryKey(),
  lotId: text("lot_id").notNull().unique(),
  data: jsonb("data").$type<{
    category: "ink" | "adhesive" | "coating" | "raw_material";
    materialName: string;
    supplierName: string;
    supplierCountry: string;
    supplierContact: string;
    quantity: number;
    unit: "kg" | "liters" | "rolls" | "sheets";
    status: "pending" | "released" | "hold";
    complianceStatus: "pending" | "documented" | "review_required";
    documentRef: string;
    complianceNotes: string;
    finishedBatches: string[];
    destinations: string[];
    allocations?: {
      finishedLotId: string;
      customer: string;
      quantity: number;
      unit: "pieces" | "kg" | "liters" | "rolls" | "sheets" | "cartons";
    }[];
  }>().notNull(),
  demo: boolean("demo").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

type Allocations = NonNullable<typeof packagingBatches.$inferSelect.data.allocations>;
export const packagingDocuments = pgTable("packaging_documents", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull().references(() => packagingBatches.id),
  ownerId: text("owner_id").notNull(),
  sharedTeamId: text("shared_team_id").references(() => packagingTeams.id),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  objectPath: text("object_path").notNull().unique(),
  scanStatus: text("scan_status").notNull().default("pending"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }),
  scanRetryAt: timestamp("scan_retry_at", { withTimezone: true }).notNull().defaultNow(),
  scanSha256: text("scan_sha256"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const packagingAllocationHistory = pgTable("packaging_allocation_history", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull().references(() => packagingBatches.id),
  lotId: text("lot_id").notNull(),
  before: jsonb("before").$type<Allocations>().notNull(),
  after: jsonb("after").$type<Allocations>().notNull(),
  correctionReason: text("correction_reason"),
  attribution: text("attribution").$type<"shared_demo">().notNull().default("shared_demo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("packaging_allocation_history_batch_time").on(table.batchId, table.createdAt)]);
