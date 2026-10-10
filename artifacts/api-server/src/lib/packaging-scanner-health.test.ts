import assert from "node:assert/strict";
import test from "node:test";
import { ScannerHealth, MINUTE, DEFINITIONS_MAX_AGE } from "./packaging-scanner-health.ts";

test("retries escalate only after repeated failures over ten minutes and recover", () => {
  const h = new ScannerHealth();
  const now = DEFINITIONS_MAX_AGE * 2;
  assert.equal(h.snapshot(now, now).status, "unknown");
  h.record(false, now);
  assert.equal(h.snapshot(now, now).status, "retrying");
  h.record(false, now + 5 * MINUTE);
  assert.equal(h.snapshot(now, now + 5 * MINUTE).status, "retrying");
  h.record(false, now + 10 * MINUTE);
  assert.equal(h.snapshot(now, now + 10 * MINUTE).status, "outage");
  h.record(true, now + 11 * MINUTE);
  assert.equal(h.snapshot(now, now + 11 * MINUTE).status, "healthy");
  assert.equal(h.consecutiveFailures, 0);
});

test("missing/stale definitions and missed probes never claim healthy", () => {
  const h = new ScannerHealth();
  const now = DEFINITIONS_MAX_AGE * 2;
  h.record(true, now);
  assert.equal(h.snapshot(null, now).status, "blocked");
  assert.equal(h.snapshot(now - DEFINITIONS_MAX_AGE, now).status, "blocked");
  assert.equal(h.snapshot(now - DEFINITIONS_MAX_AGE + 1, now).status, "healthy");
  assert.equal(h.snapshot(now, now + 11 * MINUTE).status, "unknown");
});
