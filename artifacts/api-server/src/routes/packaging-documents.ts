import { randomUUID } from "node:crypto";
import express, { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, packagingBatches, packagingDocuments } from "@workspace/db";
import {
  ListPackagingDocumentsParams, ListPackagingDocumentsResponse,
  UploadPackagingDocumentParams, UploadPackagingDocumentHeader, UploadPackagingDocumentResponse,
  DownloadPackagingDocumentParams,
} from "@workspace/api-zod";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage";
import { MAX_DOCUMENT_BYTES, validateDocument } from "../lib/packaging-file-validation";
import { evidenceDigest, readEvidence } from "../lib/packaging-scan-worker";

const router: IRouter = Router();
const base = "/packaging/batches/:batchId/documents";
const storage = new ObjectStorageService();
const serialize = ({ ownerId: _owner, objectPath: _path, scanSha256: _hash, scanRetryAt: _retry, ...row }: typeof packagingDocuments.$inferSelect) => row;
let activeUploads = 0;

router.use(base, (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Log in to access your batch documents." }); return; }
  next();
});

router.get(base, async (req, res): Promise<void> => {
  const params = ListPackagingDocumentsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid batch." }); return; }
  try {
    const [batch] = await db.select({ id: packagingBatches.id }).from(packagingBatches).where(eq(packagingBatches.id, params.data.batchId));
    if (!batch) { res.status(404).json({ error: "Batch not found." }); return; }
    const rows = await db.select().from(packagingDocuments).where(and(
      eq(packagingDocuments.batchId, params.data.batchId), eq(packagingDocuments.ownerId, req.user!.id),
    )).orderBy(desc(packagingDocuments.createdAt));
    res.json(ListPackagingDocumentsResponse.parse(rows.map(serialize)));
  } catch {
    req.log.error("Unable to list packaging documents");
    res.status(503).json({ error: "Documents could not be loaded. Please retry." });
  }
});

// Gate access and capacity BEFORE buffering. Raw bytes avoid temporary filesystem persistence.
router.post(base, (req, res, next) => {
  if (req.get("sec-fetch-site") === "cross-site" || (req.get("origin") &&
      new URL(req.get("origin")!).host !== req.get("host"))) {
    res.status(403).json({ error: "Upload from this application's page." }); return;
  }
  if (activeUploads >= 4) { res.status(429).json({ error: "Uploads are busy. Please retry shortly." }); return; }
  activeUploads++;
  let released = false;
  const release = () => { if (!released) { activeUploads--; released = true; } };
  res.once("finish", release);
  res.once("close", release);
  express.raw({ type: "application/octet-stream", limit: MAX_DOCUMENT_BYTES })(req, res, error => {
    if (error) { res.status(error.status === 413 ? 413 : 400).json({ error: "File could not be read. Use a file up to 10 MiB." }); return; }
    next();
  });
}, async (req, res): Promise<void> => {
  const params = UploadPackagingDocumentParams.safeParse(req.params);
  const headers = UploadPackagingDocumentHeader.safeParse(req.headers);
  let name = "";
  try { name = decodeURIComponent(String(req.get("x-document-name") ?? "")).trim(); } catch { /* Invalid encoding is rejected below. */ }
  const contentType = Buffer.isBuffer(req.body) ? validateDocument(name, req.body) : undefined;
  if (!params.success || !headers.success || !contentType) {
    res.status(400).json({ error: "Choose a non-empty PDF, PNG or JPEG (up to 10 MiB) with a matching filename and valid document category." }); return;
  }
  let savedFile: ReturnType<ReturnType<typeof objectStorageClient.bucket>["file"]> | undefined;
  let persisted = false;
  try {
    const [batch] = await db.select({ id: packagingBatches.id }).from(packagingBatches).where(eq(packagingBatches.id, params.data.batchId));
    if (!batch) { res.status(404).json({ error: "Batch not found. No document was uploaded." }); return; }
    const id = randomUUID();
    const path = `${storage.getPrivateObjectDir()}/packaging/${id}`;
    const [bucket, ...parts] = path.replace(/^\//, "").split("/");
    savedFile = objectStorageClient.bucket(bucket).file(parts.join("/"));
    await savedFile.save(req.body, { resumable: false, metadata: { contentType } });
    const [row] = await db.insert(packagingDocuments).values({
      id, batchId: params.data.batchId, ownerId: req.user!.id,
      kind: headers.data["x-document-kind"], name, contentType, size: req.body.length,
      objectPath: `/objects/packaging/${id}`,
    }).returning();
    persisted = true;
    res.status(201).json(UploadPackagingDocumentResponse.parse(serialize(row)));
  } catch {
    if (savedFile && !persisted) await savedFile.delete({ ignoreNotFound: true }).catch(() => req.log.error("Unable to remove unattached packaging upload"));
    req.log.error("Packaging document upload failed");
    res.status(503).json({ error: "Upload could not be saved. Your batch is unchanged. Please retry." });
  }
});

router.get(`${base}/:documentId/download`, async (req, res): Promise<void> => {
  const params = DownloadPackagingDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Document not found." }); return; }
  try {
    const [row] = await db.select().from(packagingDocuments).where(and(
      eq(packagingDocuments.id, params.data.documentId),
      eq(packagingDocuments.batchId, params.data.batchId),
      eq(packagingDocuments.ownerId, req.user!.id),
    ));
    if (!row) { res.status(404).json({ error: "Document not found or unavailable to this account." }); return; }
    if (row.scanStatus !== "clean" || !row.scanSha256) {
      res.status(423).json({ error: "Evidence is quarantined. Downloads require a successful malware scan." }); return;
    }
    const bytes = await readEvidence(row.objectPath);
    if (evidenceDigest(bytes) !== row.scanSha256) {
      await db.update(packagingDocuments).set({ scanStatus: "pending", scanSha256: null, scannedAt: null, scanRetryAt: new Date() }).where(eq(packagingDocuments.id, row.id));
      res.status(423).json({ error: "Evidence changed since scanning and has been quarantined again." }); return;
    }
    res.attachment(row.name);
    res.setHeader("Content-Type", row.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.send(bytes);
  } catch {
    req.log.error("Packaging document unavailable");
    res.status(503).json({ error: "Document is currently unavailable. Please retry." });
  }
});

export default router;
