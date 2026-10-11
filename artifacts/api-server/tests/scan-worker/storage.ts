import { Readable } from "node:stream";

export const bytes = Buffer.from("%PDF-1.4\nworker lifecycle fixture\n%%EOF");
export const controls = { mode: "ok", release: undefined as undefined | (() => void) };
export class ObjectStorageService {
  async getObjectEntityFile() {
    process.send?.({ event: "storage-read" });
    if (controls.mode === "hold") await new Promise<void>(resolve => { controls.release = resolve; });
    if (controls.mode === "missing") throw new Error("Fixture object missing");
    return {
      createReadStream() {
        if (controls.mode === "stream-error") {
          return Readable.from((async function* () {
            yield bytes.subarray(0, 5);
            throw new Error("Fixture storage connection interrupted");
          })());
        }
        return Readable.from([bytes]);
      },
    };
  }
}
// Uploads are not used by these tests.
export const objectStorageClient = {};
