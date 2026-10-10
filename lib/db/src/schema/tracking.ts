import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const materials = pgTable("materials", {
  id: text("id").primaryKey(),
  supplier: text("supplier").notNull(),
  name: text("name").notNull(),
  alert: text("alert").notNull(),
});

export const productionRuns = pgTable("production_runs", {
  id: text("id").primaryKey(),
  materialId: text("material_id").notNull().references(() => materials.id),
  quantity: integer("quantity").notNull(),
  inkLot: text("ink_lot").notNull().default(""),
  inspectionResult: text("inspection_result").notNull().default("pending"),
  releaseDecision: text("release_decision").notNull().default("pending"),
  qualityNotes: text("quality_notes").notNull().default(""),
  checklist: jsonb("checklist").$type<{label: string; result: "pending" | "passed" | "failed"; notes: string}[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  destinations: jsonb("destinations").$type<{id?: string; inspectionResult?: "pending" | "passed" | "failed"; name: string; quantity: number; type: "shipped" | "inventory"}[]>().notNull(),
});

export const qualityActions = pgTable("quality_actions", {
  requestId: text("request_id").primaryKey(),
  action: text("action").notNull(),
  batchIds: jsonb("batch_ids").$type<string[]>().notNull(),
  rationale: text("rationale").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
