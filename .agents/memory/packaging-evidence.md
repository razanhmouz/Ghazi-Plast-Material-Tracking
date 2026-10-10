---
name: Packaging evidence access
description: Privacy and validation decisions for batch-linked evidence files.
---
Evidence uploads start private. Sharing is opt-in to owner-managed evidence teams; public/shared registry access must never grant file access.

**Why:** The registry is a shared demo, not a trusted company directory. A self-created team is a sharing group, not proof of employment or company-wide authority.

**How to apply:** Team owners approve known account IDs; membership permits reading only documents explicitly shared with that team, never all documents attached to a public batch. Only uploaders change sharing. Keep authentication changes out of the original dashboard.

Access-history visibility follows two separate scopes: team owners see membership changes; uploaders see their documents' sharing transitions.

**Why:** Sharing transitions can reveal previous or subsequent teams even after a document is made private. A team's right to read a shared file should not expose the uploader's other sharing relationships.

**How to apply:** Do not grant ordinary readers access-history permission, or include document sharing transitions in a team owner's membership history without revisiting this privacy boundary.

For bounded evidence files, uploads go through the API for validation before storage rather than returning reusable signed PUT URLs.

**Why:** This permits server-side size and format checks before persistence and prevents a still-valid PUT URL from replacing an already-validated document.

**How to apply:** Keep uploads bounded; file-signature validation is not malware scanning or certification verification. Uploads must never automatically alter recorded quality or release decisions.

Malware scanning uses local ClamAV rather than sending evidence to a public scanning service. Scanner failures must leave evidence quarantined.

**Why:** Supplier evidence may be confidential, and a scanner outage must not silently grant access to unscanned files.

**How to apply:** Preserve fail-closed download checks, use private storage, and treat malware detection separately from certification verification. Any future remote scanning provider requires an explicit privacy decision.

Scanner-health visibility follows signed-in evidence access, not a newly inferred staff or company role. Queue statistics must be scoped to the requesting account's accessible files.

**Why:** There is no verified staff directory, and even aggregate quarantine counts could reveal other accounts' private activity. Availability checks can be shared because they contain no evidence metadata.

**How to apply:** Keep operational probes content-free and separate from document verdicts. Do not turn a healthy probe into permission to download or expose global evidence counts.

Document-derived failure streaks are private activity too, even without filenames or content. Do not merge them into shared scanner-health status or counters.

**Why:** An unrelated signed-in account could infer another account's failed scans and recovery by polling shared status.

**How to apply:** Derive shared availability exclusively from fixed content-free probes; apply document access controls to every document-derived count and incident indicator.
