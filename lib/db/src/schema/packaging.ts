import { pgTable, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

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
