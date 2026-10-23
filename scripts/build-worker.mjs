import { build } from "vite";
await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: "public/assets/worker",
    emptyOutDir: false,
    target: "es2022",
    minify: true,
    lib: {
      entry: "src/vision/vision.worker.js",
      name: "VigilVisionWorker",
      formats: ["iife"],
      fileName: () => "vision.worker.js",
    },
  },
});
