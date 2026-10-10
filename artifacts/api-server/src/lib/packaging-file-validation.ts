export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Basic format validation, not malware scanning or document authenticity checks. */
export function validateDocument(name: string, bytes: Buffer): string | undefined {
  if (!name.trim() || name.length > 180 || /[/\\\x00-\x1f\x7f]/.test(name)) return undefined;
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) return undefined;
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf" && bytes.subarray(0, 5).toString() === "%PDF-" &&
      bytes.subarray(-1024).includes(Buffer.from("%%EOF"))) return "application/pdf";
  if (extension === "png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
      bytes.subarray(-12).equals(Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130]))) return "image/png";
  if (["jpg", "jpeg"].includes(extension ?? "") && bytes[0] === 255 && bytes[1] === 216 &&
      bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return "image/jpeg";
  return undefined;
}
