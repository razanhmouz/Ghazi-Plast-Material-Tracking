import { pgTable, text, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { packagingTeams } from "./packaging-teams";

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
