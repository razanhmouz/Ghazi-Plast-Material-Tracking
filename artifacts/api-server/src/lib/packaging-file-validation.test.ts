import assert from "node:assert/strict";
import test from "node:test";
import { MAX_DOCUMENT_BYTES, validateDocument } from "./packaging-file-validation.ts";

const pdf = Buffer.from("%PDF-1.4\nexample\n%%EOF");
test("accepts recognized PDF and matching image signatures", () => {
  assert.equal(validateDocument("declaration.PDF", pdf), "application/pdf");
  assert.equal(validateDocument("test.png", Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,73,69,78,68,174,66,96,130])), "image/png");
  assert.equal(validateDocument("test.jpeg", Buffer.from([255,216,255,0,255,217])), "image/jpeg");
});
test("rejects empty, oversized, unsupported, renamed and truncated files", () => {
  assert.equal(validateDocument("test.pdf", Buffer.alloc(0)), undefined);
  assert.equal(validateDocument("test.pdf", Buffer.alloc(MAX_DOCUMENT_BYTES + 1)), undefined);
  assert.equal(validateDocument("test.exe", pdf), undefined);
  assert.equal(validateDocument("test.pdf", Buffer.from("<script>alert(1)</script>")), undefined);
  assert.equal(validateDocument("test.png", pdf), undefined);
  assert.equal(validateDocument("test.pdf", Buffer.from("%PDF-1.4")), undefined);
});
test("rejects path traversal, header controls, and excessive filenames", () => {
  for (const name of ["../test.pdf", "..\\test.pdf", "test\n.pdf", "test\r.pdf", "test\0.pdf", `${"a".repeat(180)}.pdf`]) {
    assert.equal(validateDocument(name, pdf), undefined);
  }
});
