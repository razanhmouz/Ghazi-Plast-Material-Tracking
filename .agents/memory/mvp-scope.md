---
name: Ghazi Plast MVP scope
description: Source-data boundaries and quality workflow assumptions.
---
The user provided supplier P-77, the two cup batch identifiers, and distribution quantities, but not an actual material lot ID, ink lot IDs, or inspection outcomes. Treat additional identifiers as demo values and quality outcomes as pending until entered.

**Why:** Fabricated quality outcomes could be mistaken for real release approvals.

**How to apply:** Preserve the distinction between supplied trace quantities and illustrative metadata when extending or importing data.

For this MVP, a batch release requires a passed inspection; the supplier alert remains visible independently of individual batch decisions.

**Why:** A local batch decision must not silently resolve a supplier-wide alert.

**How to apply:** Keep supplier alert status separate from batch quality editing.

Staff workflow: Production receives P-77 records and supplier documentation and links both cup runs; quality checks and release decisions are recorded, and Shipping links customer quantities; the user searches P-77; tracking displays affected batches, outbound deliveries, and remaining inventory.

**Why:** The user explicitly requires tracing to leave actual shipment statuses unchanged.

**How to apply:** Treat search and trace as read-only operations, and do not imply the workflow guide verifies document receipt.

Quality Manager final actions are recorded instructions, not physical recall execution or shipment releases. The user subsequently authorized Gmail notifications containing Decision history details for new recall and release decisions.

**Why:** The user explicitly requested email on new decisions and chose a fixed recipient, superseding the original no-notification scope without authorizing physical shipment changes.

**How to apply:** Send only for new confirmed decisions, not historical records. Keep shipment status and quantities unchanged. Sign-in is required to trigger email; manager labeling alone is not a verified role. Do not store recipient addresses in agent memory.

The user permits deletion of one selected decision-history record, with confirmation, rather than clearing all history.

**Why:** The user explicitly chose “A selected decision” when asked about the delete button’s scope.

**How to apply:** Keep deletion scoped to the selected record and separate from batch or shipment state; do not assume history must remain append-only.

Adding a destination adds its quantity to batch production and shipped/inventory totals; it is not a transfer of existing stock. The new row’s Passed status is explicitly confirmed by staff and does not change batch inspection or release decisions.

**Why:** The user requested newly added destinations to increase Batch Total and KPIs and display Passed; row confirmation avoids silently inventing a batch-wide quality approval.

**How to apply:** Preserve this distinction when extending destination editing, stock transfers, and quality displays.

Deleting a destination subtracts its quantity from recorded batch production and the applicable shipped/inventory total; it does not move stock elsewhere or reverse an actual shipment.

**Why:** The user explicitly requested row deletion to reduce Batch Total and the main KPI cards.

**How to apply:** Keep removal specific to the selected row, including legacy rows with duplicate names, and confirm its quantity impact before permanent deletion.
