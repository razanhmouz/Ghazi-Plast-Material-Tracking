// Only bundled by the integration runner. Never imported by the server.
import express from "express";
import pino from "pino";
import router from "../../src/routes/packaging-documents";
import { scanPendingEvidence } from "../../src/lib/packaging-scan-worker";
import { controls } from "./storage";

const RealDate = Date;
let now = Number(process.env.SCAN_TEST_NOW);
// A process-local clock lets the real SQL lease predicates run without sleeping.
globalThis.Date = class extends RealDate {
  constructor(value?: string | number | Date) {
    super(value === undefined ? now : value instanceof RealDate ? value.getTime() : value);
  }
  static now() { return now; }
} as DateConstructor;

const app = express();
const logger = pino({ enabled: false });
app.use((req, _res, next) => {
  req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
  req.user = { id: "worker-test-owner" } as typeof req.user;
  req.log = logger;
  next();
});
app.use(router);
const server = app.listen(0, "127.0.0.1", () => {
  process.send?.({ event: "ready", port: (server.address() as { port: number }).port });
});
process.on("message", async (message: { id: number; action: string; now?: number; mode?: string }) => {
  try {
    if (message.now !== undefined) now = message.now;
    if (message.mode) controls.mode = message.mode;
    if (message.action === "release") controls.release?.();
    if (message.action === "scan") await scanPendingEvidence();
    process.send?.({ id: message.id });
  } catch (error) {
    process.send?.({ id: message.id, error: String(error) });
  }
});
