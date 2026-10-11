---
name: Decision email retries
description: Safety constraints for retrying immutable decision notifications
---
Retries must preserve the original sender, recipient and contents. Unknown outcomes require an operator's recorded reconciliation against Resend logs confirming no acceptance, not simply an acknowledgement that duplicates are possible.

**Why:** A recall or release email may already have been accepted after a timeout; changing its payload or reusing a key after retention expires can create a conflicting or duplicate instruction.

**How to apply:** Keep retries inside a conservative 23-hour window measured from notification creation (an earlier bound than the first send), with a one-hour margin inside Resend's 24-hour retention. Expired and historical Gmail notifications remain blocked. Never rotate keys to bypass these restrictions.
