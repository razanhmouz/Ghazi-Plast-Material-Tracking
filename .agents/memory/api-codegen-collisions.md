---
name: API codegen name collisions
description: Orval collisions when endpoints combine path and query parameters.
---
Orval can give a path-validator value and query-parameter type the same exported name when a route has both path and query parameters.

**Why:** Star-exporting both generated modules then fails with TS2308 even though generation itself succeeds.

**How to apply:** Resolve the ambiguous export explicitly in the handwritten barrel rather than editing generated output; keep the runtime path validator available to route code. Run the shared-library typecheck after generation.
