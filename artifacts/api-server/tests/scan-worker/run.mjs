import { build } from "esbuild";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire, isBuiltin } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
await mkdir(resolve(root, ".cache"), { recursive: true });
const directory = await mkdtemp(resolve(root, ".cache/scan-worker-"));
const dependencies = {
  name: "workspace-dependencies",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, ({ path, importer }) => {
      if (isBuiltin(path) || !importer) return;
      return {
        path: createRequire(importer).resolve(path),
        external: !path.startsWith("@workspace/"),
      };
    });
  },
};
const options = { bundle: true, platform: "node", format: "esm", logLevel: "silent" };
try {
  await build({
    ...options,
    entryPoints: [resolve(root, "tests/scan-worker/child.ts")],
    outfile: resolve(directory, "child.mjs"),
    plugins: [{
      name: "isolated-worker-boundaries",
      setup(build) {
        build.onResolve({ filter: /(?:^|\/)objectStorage$/ }, () => ({
          path: resolve(root, "tests/scan-worker/storage.ts"),
        }));
        build.onLoad({ filter: /lib\/db\/src\/index.ts$/ }, async ({ path }) => {
          const source = await readFile(path, "utf8");
          const original = "new Pool({ connectionString: process.env.DATABASE_URL })";
          if (!source.includes(original)) throw new Error("Database initialization changed: refusing to run workers without schema isolation");
          return {
          contents: source.replace(
            original,
            'new Pool({ connectionString: process.env.DATABASE_URL, options: "-c search_path=" + process.env.SCAN_TEST_SCHEMA })',
          ),
          loader: "ts",
          };
        });
      },
    }, dependencies],
  });
  await build({
    ...options,
    entryPoints: [resolve(root, "tests/scan-worker/lifecycle.integration.ts")],
    outfile: resolve(directory, "tests.mjs"),
    plugins: [dependencies],
  });
  const child = spawn(process.execPath, ["--test", resolve(directory, "tests.mjs")], {
    stdio: "inherit",
    env: { ...process.env, SCAN_TEST_BUNDLE: resolve(directory, "child.mjs"), NODE_ENV: "production" },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
