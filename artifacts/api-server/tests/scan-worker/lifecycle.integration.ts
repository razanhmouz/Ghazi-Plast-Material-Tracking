import assert from "node:assert/strict";
import test from "node:test";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, utimes, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pool } from "@workspace/db";
import { bytes } from "./storage";
import { createHash } from "node:crypto";

const minute = 60_000;
const initialTime = Date.now();
const digest = createHash("sha256").update(bytes).digest("hex");
const documentId = randomUUID();
const processes = new Set<ChildProcess>();

class Worker {
  child: ChildProcess;
  port = 0;
  reads = 0;
  sequence = 0;
  pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
  ready: Promise<void>;
  constructor(schema: string, directory: string, now = initialTime) {
    this.child = fork(process.env.SCAN_TEST_BUNDLE!, [], {
      cwd: directory,
      env: { ...process.env, SCAN_TEST_SCHEMA: schema, SCAN_TEST_NOW: String(now), PATH: `${directory}/bin:${process.env.PATH}` },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    processes.add(this.child);
    this.ready = new Promise((resolve, reject) => {
      this.child.once("error", reject);
      this.child.once("exit", code => reject(new Error(`Worker exited before ready: ${code}`)));
      this.child.on("message", (message: { event?: string; port?: number; id?: number; error?: string }) => {
        if (message.event === "ready") { this.port = message.port!; resolve(); }
        if (message.event === "storage-read") this.reads++;
        if (message.id !== undefined) {
          const pending = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) pending?.reject(new Error(message.error)); else pending?.resolve();
        }
      });
    });
  }
  command(action: string, extra: { now?: number; mode?: string } = {}) {
    const id = ++this.sequence;
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.send({ id, action, ...extra });
    });
  }
  async stop() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = once(this.child, "exit");
    this.child.kill("SIGKILL");
    await exited;
    processes.delete(this.child);
  }
}

async function eventually(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for worker lease/storage barrier");
}

test("quarantine worker lifecycle (isolated PostgreSQL schema and worker processes)", { timeout: 60_000 }, async t => {
  const schema = `scan_test_${randomUUID().replaceAll("-", "")}`;
  const directory = await mkdtemp(join(tmpdir(), "scan-lifecycle-"));
  let schemaCreated = false;
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    // Clone structure only, never read, update or scan development evidence.
    for (const tablename of ["packaging_documents", "packaging_teams", "packaging_team_members"]) {
      const quoted = `"${tablename}"`;
      await pool.query(`CREATE TABLE ${schema}.${quoted} (LIKE public.${quoted} INCLUDING ALL)`);
    }
    await mkdir(join(directory, "bin"));
    await mkdir(join(directory, ".cache/packaging-clamav"), { recursive: true });
    // Real scanner orchestration/freshness checks; deterministic subprocess exits.
    await writeFile(join(directory, "bin/freshclam"), "#!/bin/sh\nexit \"$(cat freshclam-code)\"\n", { mode: 0o700 });
    await writeFile(join(directory, "bin/clamscan"), "#!/bin/sh\ncat >/dev/null\nprintf x >> scan-calls\nexit \"$(cat clamscan-code)\"\n", { mode: 0o700 });
    await writeFile(join(directory, "freshclam-code"), "0");
    await writeFile(join(directory, "clamscan-code"), "0");
    const marker = join(directory, ".cache/packaging-clamav/updated");
    await writeFile(marker, "");
    const row = async () => (await pool.query(`SELECT * FROM ${schema}.packaging_documents WHERE id = $1`, [documentId])).rows[0];
    async function reset() {
      for (const child of processes) {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
      processes.clear();
      await pool.query(`DELETE FROM ${schema}.packaging_documents`);
      await pool.query(`INSERT INTO ${schema}.packaging_documents
        (id,batch_id,owner_id,kind,name,content_type,size,object_path,scan_retry_at)
        VALUES ($3,'worker-batch','worker-test-owner','inspection_report','fixture.pdf','application/pdf',$1,'/objects/fixture',$2)`,
      [bytes.length, new Date(initialTime), documentId]);
      await writeFile(join(directory, "freshclam-code"), "0");
      await writeFile(join(directory, "clamscan-code"), "0");
      await writeFile(join(directory, "scan-calls"), "");
      await utimes(marker, new Date(initialTime), new Date(initialTime));
    }
    async function start(now = initialTime) {
      const worker = new Worker(schema, directory, now);
      await worker.ready;
      return worker;
    }
    async function blocked(worker: Worker, status: string) {
      const current = await row();
      assert.equal(current.scan_status, status);
      assert.equal(current.scan_sha256, null);
      assert.equal(current.scanned_at, null);
      const reads = worker.reads;
      const response = await fetch(`http://127.0.0.1:${worker.port}/packaging/batches/worker-batch/documents/${documentId}/download`);
      assert.equal(response.status, 423);
      assert.match(await response.text(), /quarantined/);
      assert.equal(worker.reads, reads, "blocked downloads must not read storage");
    }
    async function clean(worker: Worker) {
      const current = await row();
      assert.equal(current.scan_status, "clean");
      assert.equal(current.scan_sha256, digest);
      assert.ok(current.scanned_at);
      const response = await fetch(`http://127.0.0.1:${worker.port}/packaging/batches/worker-batch/documents/${documentId}/download`);
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    }

    await t.test("only one independent instance scans a contended lease", async () => {
      await reset();
      const first = await start();
      const second = await start();
      // Both SELECTs see the same due row while an external transaction holds
      // the update lock; only one compare-and-set may acquire it on release.
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        await connection.query(`SELECT * FROM ${schema}.packaging_documents FOR UPDATE`);
        const a = first.command("scan", { mode: "hold" });
        const b = second.command("scan", { mode: "hold" });
        await eventually(async () => {
          const result = await pool.query(`SELECT count(*)::int AS count FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query LIKE 'update "packaging_documents"%'`);
          return result.rows[0].count >= 2;
        });
        await connection.query("COMMIT");
        await eventually(async () => first.reads + second.reads === 1);
        const leased = await row();
        assert.equal(leased.scan_retry_at.getTime(), initialTime + 10 * minute);
        await blocked(first, "pending");
        await Promise.all([first.command("release", { mode: "ok" }), second.command("release", { mode: "ok" })]);
        await Promise.all([a, b]);
        assert.equal(first.reads + second.reads, 1);
        await clean(second);
      } finally {
        await connection.query("ROLLBACK");
        connection.release();
      }
    });

    await t.test("killed worker stays quarantined until a fresh process recovers the expired lease", async () => {
      await reset();
      const crashed = await start();
      void crashed.command("scan", { mode: "hold" });
      await eventually(async () => crashed.reads === 1);
      await blocked(crashed, "pending");
      await crashed.stop();
      const replacement = await start(initialTime + 10 * minute - 1);
      await replacement.command("scan");
      assert.equal(replacement.reads, 0);
      await blocked(replacement, "pending");
      await replacement.command("scan", { now: initialTime + 10 * minute });
      await clean(replacement);
    });

    await t.test("an expired worker cannot overwrite its replacement's verdict", async () => {
      await reset();
      const slow = await start();
      const original = slow.command("scan", { mode: "hold" });
      await eventually(async () => slow.reads === 1);
      const replacement = await start(initialTime + 10 * minute);
      await replacement.command("scan");
      await clean(replacement);
      const completed = await row();
      // The expired worker now sees a storage failure. Its old lease must not
      // replace the newer clean result with scan_error or erase its digest.
      await slow.command("release", { mode: "missing" });
      await original;
      assert.deepEqual(await row(), completed);
    });

    for (const mode of ["missing", "stream-error"]) {
      await t.test(`${mode} storage failure retries automatically after recovery`, async () => {
        await reset();
        const worker = await start();
        await worker.command("scan", { mode });
        await blocked(worker, "scan_error");
        assert.equal((await row()).scan_retry_at.getTime(), initialTime + 5 * minute);
        await worker.command("scan", { mode: "ok", now: initialTime + 5 * minute - 1 });
        assert.equal(worker.reads, 1, "backoff must be respected");
        await blocked(worker, "scan_error");
        await worker.command("scan", { now: initialTime + 5 * minute });
        await clean(worker);
      });
    }

    await t.test("stale definitions never invoke clamscan; refresh and retry release quarantine", async () => {
      await reset();
      const stale = new Date(initialTime - 49 * 60 * minute);
      await utimes(marker, stale, stale);
      await writeFile(join(directory, "freshclam-code"), "1");
      const worker = await start();
      await worker.command("scan");
      await blocked(worker, "scan_error");
      assert.equal(await readFile(join(directory, "scan-calls"), "utf8"), "");
      await worker.command("scan", { now: initialTime + 5 * minute });
      await blocked(worker, "scan_error");
      assert.equal(await readFile(join(directory, "scan-calls"), "utf8"), "");
      await writeFile(join(directory, "freshclam-code"), "0");
      await worker.command("scan", { now: initialTime + 30 * minute });
      await clean(worker);
      assert.equal(await readFile(join(directory, "scan-calls"), "utf8"), "x");
    });

    await t.test("scanner errors retry; malware rejection is terminal and cannot download", async () => {
      await reset();
      const worker = await start();
      await writeFile(join(directory, "clamscan-code"), "2");
      await worker.command("scan");
      await blocked(worker, "scan_error");
      await writeFile(join(directory, "clamscan-code"), "1");
      await worker.command("scan", { now: initialTime + 5 * minute });
      const rejected = await row();
      assert.equal(rejected.scan_status, "rejected");
      assert.equal(rejected.scan_sha256, null);
      assert.ok(rejected.scanned_at);
      const response = await fetch(`http://127.0.0.1:${worker.port}/packaging/batches/worker-batch/documents/${documentId}/download`);
      assert.equal(response.status, 423);
      const reads = worker.reads;
      await writeFile(join(directory, "clamscan-code"), "0");
      await worker.command("scan", { now: initialTime + 60 * minute });
      assert.equal(worker.reads, reads);
      assert.equal((await row()).scan_status, "rejected");
    });
  } finally {
    for (const child of processes) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    processes.clear();
    if (schemaCreated) await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});
