---
name: Packaging Center scope
description: Product boundaries and evidence assumptions for the separate packaging interface.
---
The user requested a separate Packaging Traceability Center for food packaging manufacturers, paper cup producers, and converters and explicitly said not to modify the existing dashboard.

**Why:** This is a separate working interface, not a replacement of the original cup-tracking dashboard.

**How to apply:** Keep new packaging features and styling isolated. Do not add navigation or other changes to the old dashboard without authorization.

Material categories are inks, adhesives, coatings, and raw materials. New sample supplier and material records are illustrative, not evidence of actual supplier certifications.

**Why:** The user supplied no source documents, test results, or real supplier dataset for this center.

**How to apply:** Label demo records; treat documented status as a human-entered reference rather than verified food-contact compliance. AI answers must remain grounded in stored records and cannot certify or automatically release products.

Exact allocations describe finished goods, not raw-material consumption. Do not infer allocation capacity from incoming material quantity or sum repeated finished-goods allocations across material traces.

**Why:** Finished production totals and conversion yields are not supplied, and multiple input materials may point to the same finished goods. Such arithmetic would invent stock balances or double-count distribution.

**How to apply:** Keep aggregate links as independent, unallocated evidence. Report only staff-entered lot/customer quantities, leaving distribution completeness and remaining stock unknown until a dedicated production/shipment model exists.

Shared-registry allocation edits must not be presented as verified staff actions, even when a browser has signed in to upload evidence.

**Why:** An evidence-upload session does not establish staff membership or authorization to act for the manufacturer. The user explicitly required shared-demo attribution to remain distinct from authenticated identity.

**How to apply:** Keep attribution honest until registry writes have their own authenticated staff authorization model; do not retroactively assign identities to earlier changes.
