import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "batchlane-package-"));
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this check with npm run test:package");
const runNpm = (args, cwd) => execFileSync(process.execPath, [npm, ...args], { cwd, encoding: "utf8", timeout: 120_000 });

try {
  const [packed] = JSON.parse(runNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", temp], root));
  const paths = packed.files.map((file) => file.path);
  for (const path of ["dist/esm/index.js", "dist/cjs/index.js", "dist/esm/index.d.ts", "dist/cjs/index.d.ts", "LICENSE", "README.md"]) {
    assert.ok(paths.includes(path), `Missing package file: ${path}`);
  }
  assert.ok(paths.every((path) => path.startsWith("dist/") || ["package.json", "README.md", "README.en.md", "LICENSE", "CHANGELOG.md"].includes(path)));
  assert.ok(packed.size < 100_000, "The package should remain small");
  writeFileSync(join(temp, "package.json"), JSON.stringify({ private: true, type: "module" }));
  runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", join(temp, packed.filename)], temp);
  const installed = JSON.parse(readFileSync(join(temp, "node_modules/batchlane/package.json"), "utf8"));
  assert.equal(installed.version, JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version);
  assert.equal(Object.keys(installed.dependencies ?? {}).length, 0);

  const assertions = `
    assert.deepEqual(Object.keys(api).sort(), ["TimeoutError", "chunk", "delay", "mapLimit", "retry", "withTimeout"].sort());
    assert.deepEqual(api.chunk([1, 2, 3], 2), [[1, 2], [3]]);
    assert.deepEqual(await api.mapLimit([1, 2, 3], 2, n => n * 2), [2, 4, 6]);
    assert.equal(await api.retry(() => "ready"), "ready");
    assert.equal(await api.withTimeout(() => 123, 1000), 123);
    await assert.rejects(api.withTimeout(() => new Promise(() => {}), 0), api.TimeoutError);
  `;
  writeFileSync(join(temp, "smoke.mjs"), `import assert from "node:assert/strict"; import * as api from "batchlane"; ${assertions}`);
  writeFileSync(join(temp, "smoke.cjs"), `const assert = require("node:assert/strict"); const api = require("batchlane"); (async () => { ${assertions} })().catch(error => { console.error(error); process.exitCode = 1; });`);
  for (const file of ["smoke.mjs", "smoke.cjs"]) {
    execFileSync(process.execPath, [file], { cwd: temp, stdio: "inherit", timeout: 10_000 });
  }
  for (const file of ["api.mts", "api.cts", "tsconfig.json"]) {
    copyFileSync(join(root, "test/types", file), join(temp, file));
  }
  execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], { cwd: temp, stdio: "inherit" });
  console.log(`Package verified: ${packed.filename}, ${packed.size} bytes; clean offline install, ESM, CommonJS and both TypeScript entry points passed.`);
} finally {
  if (dirname(resolve(temp)) !== resolve(tmpdir()) || !basename(temp).startsWith("batchlane-package-")) {
    throw new Error("Refusing to clean an unexpected temporary directory");
  }
  rmSync(temp, { recursive: true, force: true });
}
