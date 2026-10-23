import { Analyzer } from "../analysis/analyzer.js";
import { geometry } from "../analysis/geometry.js";
import { createVision } from "../vision/client.js";
import { AlarmAudio } from "./audio.js";

export function cameraError(error) {
  const messages = {
    NotAllowedError:
      "Camera permission denied. Allow camera access in the browser address bar, then select Start to retry.",
    NotFoundError:
      "No camera found. Connect or enable a webcam, then select Start.",
    NotReadableError:
      "Camera is busy or unavailable. Close other camera apps, reconnect it, then select Start.",
    OverconstrainedError:
      "This camera could not satisfy the request. Choose another camera and retry.",
    SecurityError:
      "Camera access is blocked. Open http://localhost:5173 in a supported Chromium browser.",
  };
  return (
    messages[error.name] ||
    error.message ||
    "Camera or inference failed. Stop and retry."
  );
}
export class MonitorController {
  constructor({
    config,
    video,
    onUpdate,
    mediaDevices = navigator.mediaDevices,
    visionFactory = createVision,
    audio = new AlarmAudio(),
    now = () => performance.now(),
    doc = document,
    timers = globalThis,
    bitmapFactory = (image) => createImageBitmap(image),
    canvasFactory = () => document.createElement("canvas"),
  }) {
    Object.assign(this, {
      video,
      onUpdate,
      mediaDevices,
      visionFactory,
      audio,
      now,
      doc,
      timers,
      bitmapFactory,
      canvasFactory,
    });
    this.analyzer = new Analyzer(config);
    this.generation = 0;
    this.state = {
      lifecycle: "OFF",
      progress: "",
      error: null,
      cameraOpen: false,
      devices: [],
      mode: "",
      latencyMs: null,
      rateHz: null,
    };
    this.history = [];
    this.overlay = null;
    this.frames = [];
    this.loopId = null;
    this.tickId = null;
    this.analysisEpoch = 0;
    this.visibility = () => {
      if (
        this.state.lifecycle !== "RUNNING" &&
        this.state.lifecycle !== "PAUSED"
      )
        return;
      if (this.doc.hidden) {
        this.analysisEpoch++;
        this.testingAudio = false;
        this.state.lifecycle = "PAUSED";
        this.analyzer.pause(this.now());
        this.audio.stop();
        this.overlay = null;
        this.cancelLoop();
      } else {
        this.state.lifecycle = "RUNNING";
        this.analyzer.resume(this.now());
        this.schedule(this.generation);
      }
      this.publish();
    };
    this.devicesChanged = () => {
      this.listDevices();
    };
    doc.addEventListener("visibilitychange", this.visibility);
    mediaDevices?.addEventListener?.("devicechange", this.devicesChanged);
    this.listDevices();
  }
  async listDevices() {
    try {
      const devices = await this.mediaDevices?.enumerateDevices();
      if (this.disposed) return;
      this.state.devices = (devices ?? [])
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({
          id: d.deviceId,
          label: d.label || `Camera ${i + 1} · grant permission for its name`,
        }));
      this.publish();
    } catch {
      /* Labels and enumeration may be restricted before permission. */
    }
  }
  publish() {
    if (this.disposed) return;
    const now = this.now(),
      analysis = this.analyzer.snapshot(now);
    const critical =
      this.state.lifecycle === "RUNNING" && analysis.status === "DROWSY";
    if (!this.testingAudio) this.audio.update(critical, this.analyzer.config);
    this.onUpdate({
      ...analysis,
      ...this.state,
      status:
        this.state.lifecycle !== "RUNNING"
          ? this.state.lifecycle
          : analysis.status,
      history: [...this.history],
      overlay: this.overlay,
      config: { ...this.analyzer.config },
      audioBlocked: this.audio.blocked,
      silenceRemainingMs: Math.max(0, this.audio.silencedUntil - now),
      hasSession: this.analyzer.startedAt !== null,
    });
  }
  async start(deviceId = "", preserveSession = false) {
    if (["LOADING", "RUNNING", "PAUSED"].includes(this.state.lifecycle)) return;
    this.cleanup();
    const generation = ++this.generation;
    const abort = new AbortController();
    this.abort = abort;
    this.state = {
      ...this.state,
      lifecycle: "LOADING",
      error: null,
      progress: "Requesting camera permission…",
      latencyMs: null,
      rateHz: null,
      mode: "",
    };
    this.audio.silencedUntil = 0;
    this.audio.unlock();
    this.publish();
    let stream, vision;
    try {
      if (!this.mediaDevices?.getUserMedia)
        throw new Error(
          "Webcam access is unavailable. Use a Chromium browser on localhost or HTTPS.",
        );
      stream = await this.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
        audio: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.state.cameraOpen = true;
      this.video.srcObject = stream;
      for (const track of stream.getVideoTracks())
        track.onended = () => {
          if (generation === this.generation)
            this.fail(
              new Error(
                "Camera disconnected or ended. Reconnect it and select Start.",
              ),
            );
        };
      await this.video.play();
      if (generation !== this.generation) return;
      this.listDevices();
      vision = await this.visionFactory({
        signal: abort.signal,
        onProgress: (progress) => {
          if (generation === this.generation) {
            this.state.progress = progress;
            this.publish();
          }
        },
      });
      if (generation !== this.generation) {
        vision.close();
        return;
      }
      this.vision = vision;
      this.canvas = this.canvasFactory();
      this.ctx = this.canvas.getContext("2d", { alpha: false });
      if (!this.ctx) throw new Error("Canvas is unavailable in this browser.");
      if (preserveSession) {
        this.analyzer.advance(this.now());
        this.analyzer.lifecycle = "RUNNING";
      } else this.analyzer.start(this.now());
      this.history = [];
      this.frames = [];
      this.lastFrameT = -Infinity;
      this.lastVideoTime = -1;
      this.state.lifecycle = "RUNNING";
      this.state.mode = vision.mode;
      this.state.progress = "";
      this.inFlight = false;
      this.tickId = this.timers.setInterval(() => {
        this.analyzer.tick(this.now());
        if (this.analyzer.tracking !== "TRACKING") {
          this.overlay = null;
          this.addHistory(this.now(), null);
        }
        this.publish();
      }, 200);
      if (this.doc.hidden) this.visibility();
      else this.schedule(generation);
      this.publish();
    } catch (error) {
      if (generation !== this.generation) {
        vision?.close();
        return;
      }
      this.fail(error);
    }
  }
  schedule(generation) {
    if (
      generation !== this.generation ||
      this.state.lifecycle !== "RUNNING" ||
      this.loopId !== null
    )
      return;
    const callback = () => {
      this.loopId = null;
      this.frame(generation);
    };
    if (this.video.requestVideoFrameCallback) {
      this.loopKind = "video";
      this.loopId = this.video.requestVideoFrameCallback(callback);
    } else {
      this.loopKind = "raf";
      this.loopId = this.timers.requestAnimationFrame(callback);
    }
  }
  async frame(generation) {
    if (generation !== this.generation || this.state.lifecycle !== "RUNNING")
      return;
    this.schedule(generation);
    const t = this.now(),
      epoch = this.analysisEpoch;
    const minInterval = this.state.mode.startsWith("Main") ? 125 : 1000 / 12;
    if (
      this.inFlight ||
      t - this.lastFrameT < minInterval ||
      this.video.currentTime === this.lastVideoTime ||
      !this.video.videoWidth ||
      !this.video.videoHeight
    )
      return;
    this.inFlight = true;
    this.lastFrameT = t;
    this.lastVideoTime = this.video.currentTime;
    let bitmap;
    try {
      const scale = Math.min(
        640 / this.video.videoWidth,
        480 / this.video.videoHeight,
        1,
      );
      const width = Math.max(1, Math.round(this.video.videoWidth * scale)),
        height = Math.max(1, Math.round(this.video.videoHeight * scale));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.ctx.drawImage(this.video, 0, 0, width, height);
      bitmap = await this.bitmapFactory(this.canvas);
      if (
        generation !== this.generation ||
        this.state.lifecycle !== "RUNNING"
      ) {
        bitmap.close();
        return;
      }
      const result = await this.vision.detect(bitmap, t);
      bitmap = null;
      if (
        generation !== this.generation ||
        epoch !== this.analysisEpoch ||
        this.state.lifecycle !== "RUNNING"
      )
        return;
      const receivedAt = this.now();
      const values = geometry(result.landmarks, width, height);
      const snapshot = this.analyzer.observe({ t, receivedAt, ...values });
      this.overlay =
        snapshot.tracking === "TRACKING" &&
        !snapshot.calibrationProgress &&
        receivedAt - t <= this.analyzer.config.maxResultAgeMs
          ? { landmarks: result.landmarks, width, height }
          : null;
      this.addHistory(t, snapshot.measurements?.averageEAR ?? null);
      this.frames.push(receivedAt);
      this.frames = this.frames.filter((f) => receivedAt - f <= 3000);
      this.state.latencyMs = result.latencyMs;
      const rateWindowMs =
        this.frames.length > 1 ? this.frames.at(-1) - this.frames[0] : 0;
      this.state.rateHz =
        rateWindowMs >= 1000 && this.frames.length >= 5
          ? ((this.frames.length - 1) * 1000) / rateWindowMs
          : null;
      if (
        !this.lastPublished ||
        receivedAt - this.lastPublished >= 100 ||
        !snapshot.measurements
      ) {
        this.lastPublished = receivedAt;
        this.publish();
      }
    } catch (error) {
      bitmap?.close();
      if (generation === this.generation) this.fail(error);
    } finally {
      if (generation === this.generation) this.inFlight = false;
    }
  }
  addHistory(t, ear) {
    if (this.history.length && t <= this.history.at(-1).t) return;
    this.history.push({ t, ear });
    this.history = this.history.filter((p) => t - p.t <= 60000).slice(-750);
  }
  cancelLoop() {
    if (this.loopId === null) return;
    if (this.loopKind === "video")
      this.video.cancelVideoFrameCallback(this.loopId);
    else this.timers.cancelAnimationFrame(this.loopId);
    this.loopId = null;
  }
  cleanup() {
    this.abort?.abort();
    this.abort = null;
    this.cancelLoop();
    if (this.tickId !== null) this.timers.clearInterval(this.tickId);
    this.tickId = null;
    this.vision?.close();
    this.vision = null;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
    this.video.srcObject = null;
    this.audio.stop();
    this.testingAudio = false;
    this.overlay = null;
    this.state.cameraOpen = false;
    if (this.testTimer) this.timers.clearTimeout(this.testTimer);
  }
  stop() {
    this.generation++;
    this.analyzer.stop(this.now());
    this.cleanup();
    this.state.lifecycle = "OFF";
    this.state.progress = "";
    this.publish();
  }
  fail(error) {
    const message = cameraError(error);
    this.generation++;
    if (this.analyzer.startedAt === null)
      this.analyzer.event("ERROR", this.now(), message);
    this.analyzer.stop(this.now(), message);
    this.cleanup();
    this.state.lifecycle = "ERROR";
    this.state.error = message;
    this.state.progress = "";
    this.publish();
  }
  async switchCamera(id) {
    const active = ["RUNNING", "PAUSED", "LOADING"].includes(
      this.state.lifecycle,
    );
    if (!active) return;
    const preserve =
      this.analyzer.startedAt !== null && this.analyzer.stoppedAt === null;
    this.generation++;
    this.analysisEpoch++;
    if (preserve) this.analyzer.cameraChanged(this.now());
    this.cleanup();
    this.state.lifecycle = "OFF";
    await this.start(id, preserve);
  }
  configure(config) {
    const previous = this.analyzer.config;
    const result = this.analyzer.configure(config, this.now());
    if (result.valid) {
      if (!result.config.sound && previous.sound) {
        this.testingAudio = false;
        this.audio.stop();
      }
      if (
        Object.keys(result.config).some(
          (k) =>
            !["sound", "volume", "overlay"].includes(k) &&
            result.config[k] !== previous[k],
        )
      ) {
        this.analysisEpoch++;
        this.overlay = null;
        this.addHistory(this.now(), null);
      }
      this.publish();
    }
    return result;
  }
  resetDefaults() {
    this.analysisEpoch++;
    this.analyzer.resetDefaults(this.now());
    this.overlay = null;
    this.addHistory(this.now(), null);
    this.publish();
  }
  calibrate() {
    this.analysisEpoch++;
    this.testingAudio = false;
    this.audio.stop();
    this.analyzer.beginCalibration(this.now());
    this.overlay = null;
    this.addHistory(this.now(), null);
    this.publish();
  }
  cancelCalibration() {
    this.analysisEpoch++;
    this.analyzer.cancelCalibration(this.now());
    this.publish();
  }
  silence() {
    this.audio.silence();
    this.publish();
  }
  async testAlarm() {
    const generation = this.generation;
    if (this.testTimer) this.timers.clearTimeout(this.testTimer);
    this.testingAudio = true;
    await this.audio.test(this.analyzer.config.volume);
    if (this.disposed || generation !== this.generation) {
      this.audio.stop();
      return;
    }
    this.testTimer = this.timers.setTimeout(() => {
      this.testingAudio = false;
      this.publish();
    }, 750);
    this.publish();
  }
  export() {
    this.analyzer.tick(this.now());
    return this.analyzer.export();
  }
  dispose() {
    this.disposed = true;
    this.stop();
    this.audio.dispose();
    this.doc.removeEventListener("visibilitychange", this.visibility);
    this.mediaDevices?.removeEventListener?.(
      "devicechange",
      this.devicesChanged,
    );
  }
}
