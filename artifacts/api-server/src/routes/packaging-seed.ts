import { db, packagingBatches } from "@workspace/db";

let seeded: Promise<void> | undefined;
export function ensurePackagingSamples() {
  if (!seeded) seeded = seed().catch(error => { seeded = undefined; throw error; });
  return seeded;
}
async function seed() {
  const base = {
    supplierCountry: "Not supplied",
    supplierContact: "Not supplied",
    status: "pending" as const,
    complianceStatus: "pending" as const,
    documentRef: "",
    complianceNotes: "Illustrative sample only. No supplier documents or food-contact compliance evidence has been verified.",
    finishedBatches: ["DEMO-CUP-210"],
    destinations: ["Demo Customer North"],
  };
  await db.insert(packagingBatches).values([
    { id: "demo-ink-104", lotId: "DEMO-INK-104", demo: true, data: { ...base, category: "ink", materialName: "Water-based printing ink · cyan", supplierName: "Demo ColorWorks", quantity: 240, unit: "kg", status: "hold", complianceStatus: "review_required", complianceNotes: "Demo review scenario: migration-test evidence has not been supplied. Hold pending human review." } },
    { id: "demo-adh-082", lotId: "DEMO-ADH-082", demo: true, data: { ...base, category: "adhesive", materialName: "Water-based seam adhesive", supplierName: "Demo Bond Materials", quantity: 180, unit: "kg", finishedBatches: ["DEMO-CUP-210", "DEMO-TRAY-115"], destinations: ["Demo Customer North", "Demo Customer West"] } },
    { id: "demo-coat-063", lotId: "DEMO-COAT-063", demo: true, data: { ...base, category: "coating", materialName: "Aqueous barrier coating", supplierName: "Demo Barrier Labs", quantity: 320, unit: "liters", finishedBatches: ["DEMO-TRAY-115"], destinations: ["Demo Customer West"] } },
    { id: "demo-raw-301", lotId: "DEMO-RAW-301", demo: true, data: { ...base, category: "raw_material", materialName: "Cupstock paperboard · 280 gsm", supplierName: "Demo Fiber Supply", quantity: 48, unit: "rolls", finishedBatches: ["DEMO-CUP-210", "DEMO-CUP-211"], destinations: ["Demo Customer North", "Demo Customer East"] } },
    { id: "demo-raw-302", lotId: "DEMO-RAW-302", demo: true, data: { ...base, category: "raw_material", materialName: "Unprinted tray board", supplierName: "Demo Fiber Supply", quantity: 12000, unit: "sheets", finishedBatches: ["DEMO-TRAY-115"], destinations: ["Demo Customer West"] } },
  ]).onConflictDoNothing();
}
