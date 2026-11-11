import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "dist");
const pathFromRoot = relative(root, dist);
if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) throw new Error("Unsafe build directory");
rmSync(dist, { recursive: true, force: true });
const compiler = resolve(root, "node_modules/typescript/bin/tsc");
for (const format of ["esm", "cjs"]) {
  const args = [compiler, "-p", "tsconfig.json", "--outDir", `dist/${format}`];
  if (format === "cjs") args.push("--module", "CommonJS", "--moduleResolution", "Node10");
  execFileSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  mkdirSync(resolve(dist, format), { recursive: true });
  writeFileSync(resolve(dist, format, "package.json"), JSON.stringify({ type: format === "cjs" ? "commonjs" : "module" }) + "\n");
}
console.log("Built ESM, CommonJS, declarations and source maps.");
