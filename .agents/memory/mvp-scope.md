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
