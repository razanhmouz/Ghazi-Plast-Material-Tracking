---
name: Packaging concurrency
description: Precision and reconciliation constraints for optimistic trace edits.
---
Keep timestamp-based edit preconditions at the precision exposed to clients, and strictly advance the token on every successful write.

**Why:** Database-generated timestamps can carry microseconds while JavaScript serializes milliseconds. Exact raw database comparisons can falsely reject unchanged legacy records; equal tokens on rapid writes can silently lose edits.

**How to apply:** Any new writer of packaging records must honor the same atomic precondition and token advancement. Conflict handling must preserve the draft and require explicit review, not silently retry with a refreshed token or automatically merge whole allocation lists.
