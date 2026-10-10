---
name: Packaging evidence access
description: Privacy and validation decisions for batch-linked evidence files.
---
Evidence files are private to the signed-in uploader; public/shared registry access must not grant file access.

**Why:** The existing registry is a shared demo with no staff membership or organization authorization model. Treating any signed-in visitor as staff would expose supplier documents.

**How to apply:** Preserve uploader-scoped access until explicit staff membership and sharing rules are implemented. Keep authentication changes out of the original dashboard.

For bounded evidence files, uploads go through the API for validation before storage rather than returning reusable signed PUT URLs.

**Why:** This permits server-side size and format checks before persistence and prevents a still-valid PUT URL from replacing an already-validated document.

**How to apply:** Keep uploads bounded; file-signature validation is not malware scanning or certification verification. Uploads must never automatically alter recorded quality or release decisions.
