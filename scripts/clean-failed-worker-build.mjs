// One-time repair of a generated-only build tree. Refuses symlinks/unknown files.
import { lstat, readdir, realpath, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
const project = await realpath(process.cwd());
const root = await realpath(path.join(project, "public/assets/worker"));
if (root !== path.join(project, "public/assets/worker"))
  throw new Error("Unexpected output directory.");
const allowed = new Set([
  "favicon.svg",
  "manifest.json",
  "face_landmarker.task",
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
  "vision.worker.js",
]);
const files = [],
  directories = [];
async function inspect(directory) {
  for (const name of await readdir(directory)) {
    const file = path.join(directory, name);
    if (!file.startsWith(root + path.sep))
      throw new Error("Path escaped generated directory.");
    const stat = await lstat(file);
    if (stat.isSymbolicLink()) throw new Error("Refusing a symbolic link.");
    if (stat.isDirectory()) {
      if (!["assets", "vision", "worker"].includes(name))
        throw new Error(`Unknown directory: ${name}`);
      await inspect(file);
      directories.push(file);
    } else {
      if (!allowed.has(name)) throw new Error(`Unknown file: ${name}`);
      files.push(file);
    }
  }
}
await inspect(root); // Validate the complete inventory before any removal.
for (const file of files) await unlink(file);
for (const directory of directories) await rmdir(directory); // Empty directories only, never recursive.
console.log(
  `Removed ${files.length} verified generated files and ${directories.length} empty directories; kept output root.`,
);
