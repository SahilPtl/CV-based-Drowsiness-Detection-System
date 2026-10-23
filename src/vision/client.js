import { loadLandmarker } from "./model.js";
class WorkerVision {
  constructor(worker, delegate) {
    this.worker = worker;
    this.delegate = delegate;
    this.mode = `Worker · ${delegate}`;
    this.closed = false;
    worker.onmessage = ({ data }) => {
      if (data.type === "error") this.reject?.(new Error(data.message));
      else this.resolve?.(data);
      this.resolve = null;
      this.reject = null;
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.reject?.(new Error(event.message || "Vision worker failed."));
      this.resolve = null;
      this.reject = null;
    };
  }
  request(message, transfer = []) {
    if (this.closed) return Promise.reject(new Error("Vision closed."));
    if (this.resolve)
      return Promise.reject(new Error("A vision frame is already in flight."));
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.worker.postMessage(message, transfer);
    });
  }
  async init(baseUrl) {
    let timer;
    try {
      await Promise.race([
        this.request({ type: "init", baseUrl, delegate: this.delegate }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Model initialization timed out. Run npm run setup:assets and retry.",
                ),
              ),
            30000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    return this;
  }
  detect(bitmap, t) {
    return this.request({ type: "frame", bitmap, t }, [bitmap]);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.reject?.(new Error("Vision cancelled."));
    this.resolve = null;
    this.reject = null;
    // Termination releases the entire WASM/GPU realm, including rejected initializations.
    this.worker.terminate();
  }
}
export async function createVision({ signal, onProgress = () => {} } = {}) {
  const baseUrl = new URL(import.meta.env.BASE_URL, location.href).href;
  let failure;
  if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
    for (const delegate of ["GPU", "CPU"]) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      onProgress(
        `Loading local model · ${delegate === "GPU" ? "GPU worker" : "CPU fallback"}`,
      );
      // This pinned telemetry-free release uses importScripts for WASM loaders.
      // setup:assets/build bundle our source as a classic IIFE worker for dev AND production.
      const client = new WorkerVision(
        new Worker(`${baseUrl}assets/worker/vision.worker.js`),
        delegate,
      );
      const abort = () => client.close();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        await client.init(baseUrl);
        return client;
      } catch (error) {
        client.close();
        failure = error;
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    }
    throw new Error(
      `Local model could not initialize. Run npm run setup:assets, reload, and retry. ${failure?.message ?? ""}`,
    );
  }
  // A conservative, explicitly reported fallback for browsers without worker canvas support.
  for (const delegate of ["GPU", "CPU"]) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    onProgress(`Loading local model · main thread ${delegate}`);
    let model;
    try {
      model = await loadLandmarker(baseUrl, delegate);
      if (signal?.aborted) {
        model.close();
        throw new DOMException("Cancelled", "AbortError");
      }
      return {
        mode: `Main thread · ${delegate} · 8 Hz cap`,
        async detect(bitmap, t) {
          const start = performance.now();
          try {
            return {
              t,
              landmarks:
                model.detectForVideo(bitmap, t).faceLandmarks[0] ?? null,
              latencyMs: performance.now() - start,
            };
          } finally {
            bitmap.close();
          }
        },
        close: () => model.close(),
      };
    } catch (error) {
      model?.close();
      failure = error;
    }
  }
  throw new Error(
    `Local model failed. Check local assets and browser graphics support. ${failure?.message ?? ""}`,
  );
}
