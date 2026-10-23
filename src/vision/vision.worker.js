import { loadLandmarker } from "./model.js";
let landmarker;
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      landmarker = await loadLandmarker(data.baseUrl, data.delegate);
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", message: error.message });
    }
  } else if (data.type === "frame") {
    const start = performance.now();
    try {
      const result = landmarker.detectForVideo(data.bitmap, data.t);
      self.postMessage({
        type: "result",
        t: data.t,
        landmarks: result.faceLandmarks[0] ?? null,
        latencyMs: performance.now() - start,
      });
    } catch (error) {
      self.postMessage({ type: "error", message: error.message });
    } finally {
      data.bitmap.close();
    }
  } else if (data.type === "close") {
    landmarker?.close();
    self.close();
  }
};
