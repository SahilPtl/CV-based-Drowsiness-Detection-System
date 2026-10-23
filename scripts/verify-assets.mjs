import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const manifest = JSON.parse(
  await readFile("dist/assets/manifest.json", "utf8"),
);
for (const file of [
  { name: "face_landmarker.task", ...manifest.model },
  ...manifest.wasm.map((f) => ({ ...f, name: `vision/${f.name}` })),
]) {
  const bytes = await readFile(`dist/assets/${file.name}`);
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
    throw new Error(`Checksum mismatch: ${file.name}`);
}
const worker = await readFile("dist/assets/worker/vision.worker.js", "utf8");
if (!worker.includes("detectForVideo"))
  throw new Error("Worker bundle is incomplete.");
for (const source of [
  worker,
  ...(await Promise.all(
    (await readdir("dist/assets"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFile(`dist/assets/${f}`, "utf8")),
  )),
]) {
  if (/odml\.pa\.googleapis\.com|sendBeacon|createTasksLogger/.test(source))
    throw new Error("Unexpected telemetry signature in production JavaScript.");
}
console.log(
  "Production assets verified: model, all matching WASM variants, worker chunk.",
);
