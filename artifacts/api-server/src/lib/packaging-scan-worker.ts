import { createHash } from "node:crypto";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db, packagingDocuments } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { MAX_DOCUMENT_BYTES, validateDocument } from "./packaging-file-validation";
import { scanEvidence } from "./packaging-malware-scanner";
import { logger } from "./logger";

const storage = new ObjectStorageService();
let running = false;
export const evidenceDigest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export async function readEvidence(objectPath: string): Promise<Buffer> {
  const file = await storage.getObjectEntityFile(objectPath);
  const stream = file.createReadStream();
  const chunks: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(() => stream.destroy(new Error("Evidence read timed out")), 30000);
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > MAX_DOCUMENT_BYTES) throw new Error("Evidence exceeds size limit");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); stream.destroy(); }
}

export async function scanPendingEvidence() {
  if (running) return;
  running = true;
  try {
    const due = and(inArray(packagingDocuments.scanStatus, ["pending", "scan_error"]), lte(packagingDocuments.scanRetryAt, new Date()));
    const [candidate] = await db.select().from(packagingDocuments).where(due).orderBy(packagingDocuments.scanRetryAt).limit(1);
    if (!candidate) return;
    // Durable lease: other server instances cannot scan the same row concurrently.
    // A killed process is recovered automatically after the lease expires.
    const [row] = await db.update(packagingDocuments).set({
      scanRetryAt: new Date(Date.now() + 10 * 60 * 1000),
    }).where(and(eq(packagingDocuments.id, candidate.id), due)).returning();
    if (!row) return;
    let status: "clean" | "rejected" | "scan_error" = "scan_error";
    let digest: string | null = null;
    try {
      const bytes = await readEvidence(row.objectPath);
      status = bytes.length === row.size && validateDocument(row.name, bytes) === row.contentType
        ? await scanEvidence(bytes) : "rejected";
      if (status === "clean") digest = evidenceDigest(bytes);
    } catch { /* Missing storage or scanner must never release quarantine. */ }
    await db.update(packagingDocuments).set({
      scanStatus: status, scanSha256: digest,
      scannedAt: status === "scan_error" ? null : new Date(),
      scanRetryAt: new Date(Date.now() + 5 * 60 * 1000),
    }).where(and(eq(packagingDocuments.id, row.id), eq(packagingDocuments.scanRetryAt, row.scanRetryAt)));
    if (status === "scan_error") logger.warn({ documentId: row.id }, "Evidence scan failed; quarantined and scheduled for retry");
  } catch { logger.error("Evidence scan worker failed; quarantine retained"); }
  finally { running = false; }
}

export function startEvidenceScanner() {
  void scanPendingEvidence();
  setInterval(() => void scanPendingEvidence(), 5000).unref();
}
