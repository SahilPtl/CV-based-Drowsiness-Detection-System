import {
  mkdir,
  readFile,
  readdir,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = process.cwd();
const url =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const modelSha256 =
  "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const target = path.join(root, "public/assets");
const packageRoot = path.join(root, "node_modules/@mediapipe/tasks-vision");
async function atomic(file, bytes) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
await mkdir(path.join(target, "vision"), { recursive: true });
const pkg = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8"),
);
const vendorSource = await readFile(
  path.join(packageRoot, "vision_bundle.mjs"),
  "utf8",
);
if (
  pkg.version !== "0.10.32" ||
  /odml\.pa\.googleapis\.com|sendBeacon|createTasksLogger/.test(vendorSource)
)
  throw new Error(
    "Unexpected MediaPipe version or metrics sender. Audit privacy before changing the pinned dependency.",
  );
let previous;
try {
  previous = JSON.parse(
    await readFile(path.join(target, "manifest.json"), "utf8"),
  );
} catch {
  /* First setup. */
}
const modelPath = path.join(target, "face_landmarker.task");
let model;
try {
  const existing = await readFile(modelPath);
  if (hash(existing) === modelSha256) model = existing;
} catch {
  /* Missing model is downloaded below. */
}
if (!model) {
  console.log("Downloading official version 1 Face Landmarker model…");
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok)
    throw new Error(
      `Model download failed: HTTP ${response.status}; existing file was not changed.`,
    );
  const candidate = Buffer.from(await response.arrayBuffer());
  if (hash(candidate) !== modelSha256)
    throw new Error(
      "Official model checksum did not match the pinned release; existing file retained.",
    );
  if (
    candidate.length < 1000000 ||
    candidate[0] !== 0 ||
    candidate[2] !== 0x50 ||
    candidate[3] !== 0x4b
  ) {
    // .task files have a short alignment prefix before their ZIP header.
    if (
      candidate.length < 1000000 ||
      candidate.indexOf(Buffer.from("PK\x03\x04")) > 16 ||
      candidate.indexOf(Buffer.from("PK\x03\x04")) < 0
    )
      throw new Error("Invalid model archive; existing file retained.");
  }
  if (previous?.model.url === url && previous.model.sha256 !== hash(candidate))
    throw new Error(
      "Versioned model checksum changed. Existing asset retained; investigate the source before updating the manifest.",
    );
  model = candidate;
  await atomic(modelPath, model);
}
const files = [];
for (const name of (await readdir(path.join(packageRoot, "wasm")))
  .filter((n) => /\.(wasm|js)$/.test(n))
  .sort()) {
  const bytes = await readFile(path.join(packageRoot, "wasm", name));
  await atomic(path.join(target, "vision", name), bytes);
  files.push({ name, bytes: bytes.length, sha256: hash(bytes) });
}
const manifest = {
  package: "@mediapipe/tasks-vision",
  version: pkg.version,
  license: pkg.license,
  model: {
    version: "float16/1",
    url,
    bytes: model.length,
    sha256: hash(model),
  },
  wasm: files,
};
for (const oldName of await readdir(path.join(target, "vision"))) {
  if (
    /^vision_wasm_[a-z_]+\.(js|wasm)$/.test(oldName) &&
    !files.some((f) => f.name === oldName)
  )
    await unlink(path.join(target, "vision", oldName));
}
await atomic(
  path.join(target, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await import("./build-worker.mjs");
console.log(
  `Ready: ${pkg.version}, ${files.length} WASM files; model SHA-256 ${hash(model)}`,
);
