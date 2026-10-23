import { afterEach, describe, expect, it, vi } from "vitest";
import { MonitorController } from "../src/browser/controller.js";
import { AlarmAudio } from "../src/browser/audio.js";
import { DEFAULTS } from "../src/analysis/config.js";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function harness(overrides = {}) {
  let clock = 0,
    callbackId = 0;
  const callbacks = new Map();
  const track = { stop: vi.fn(), onended: null };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const video = {
    srcObject: null,
    currentTime: 1,
    videoWidth: 640,
    videoHeight: 480,
    play: vi.fn(async () => {}),
    requestVideoFrameCallback: vi.fn((cb) => {
      callbacks.set(++callbackId, cb);
      return callbackId;
    }),
    cancelVideoFrameCallback: vi.fn((id) => callbacks.delete(id)),
  };
  const mediaDevices = {
    getUserMedia: vi.fn(async () => stream),
    enumerateDevices: vi.fn(async () => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const doc = {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const vision = {
    mode: "Worker · CPU",
    close: vi.fn(),
    detect: vi.fn(async () => ({ landmarks: null, latencyMs: 10 })),
  };
  const audio = {
    unlock: vi.fn(async () => true),
    stop: vi.fn(),
    update: vi.fn(),
    dispose: vi.fn(),
    silence: vi.fn(),
    test: vi.fn(),
    silencedUntil: 0,
  };
  const state = [];
  const controller = new MonitorController({
    config: DEFAULTS,
    video,
    mediaDevices,
    doc,
    audio,
    now: () => clock,
    onUpdate: (s) => state.push(s),
    visionFactory: vi.fn(async () => vision),
    canvasFactory: () => ({ getContext: () => ({ drawImage: vi.fn() }) }),
    bitmapFactory: async () => ({ close: vi.fn() }),
    ...overrides,
  });
  return {
    controller,
    track,
    stream,
    video,
    mediaDevices,
    vision,
    audio,
    doc,
    state,
    callbacks,
    setClock: (t) => {
      clock = t;
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("camera lifecycle with mocked browser APIs", () => {
  it("stops late permission results after Stop and never loads a model", async () => {
    vi.useFakeTimers();
    const pending = deferred(),
      visionFactory = vi.fn();
    const h = harness({ visionFactory });
    h.mediaDevices.getUserMedia.mockReturnValue(pending.promise);
    const starting = h.controller.start();
    h.controller.stop();
    pending.resolve(h.stream);
    await starting;
    expect(h.track.stop).toHaveBeenCalledTimes(1);
    expect(visionFactory).not.toHaveBeenCalled();
    expect(h.controller.state.lifecycle).toBe("OFF");
    h.controller.dispose();
  });
  it("closes a late model after Stop and does not restart loops", async () => {
    vi.useFakeTimers();
    const pending = deferred(),
      factory = vi.fn(() => pending.promise);
    const h = harness({ visionFactory: factory });
    const starting = h.controller.start();
    await vi.waitFor(() => expect(factory).toHaveBeenCalled());
    h.controller.stop();
    pending.resolve(h.vision);
    await starting;
    expect(h.vision.close).toHaveBeenCalledTimes(1);
    expect(h.video.requestVideoFrameCallback).not.toHaveBeenCalled();
    expect(h.track.stop).toHaveBeenCalledTimes(1);
    h.controller.dispose();
  });
  it("prevents duplicate starts and leaves no loops or tracks after repeated stops", async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.controller.start();
    await h.controller.start();
    expect(h.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(h.callbacks.size).toBe(1);
    h.controller.stop();
    h.controller.stop();
    expect(h.track.stop).toHaveBeenCalledTimes(1);
    expect(h.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    h.setClock(10000);
    await h.controller.start();
    expect(h.controller.analyzer.stats.validMs).toBe(0);
    h.controller.dispose();
    expect(h.doc.removeEventListener).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("hidden tab stops analysis/audio; pre-pause result cannot enter resumed analysis", async () => {
    vi.useFakeTimers();
    const pending = deferred(),
      h = harness();
    await h.controller.start();
    h.vision.detect.mockReturnValue(pending.promise);
    h.setClock(100);
    const frame = h.controller.frame(h.controller.generation);
    await vi.waitFor(() => expect(h.vision.detect).toHaveBeenCalled());
    h.doc.hidden = true;
    h.setClock(150);
    h.controller.visibility();
    expect(h.controller.state.lifecycle).toBe("PAUSED");
    expect(h.audio.stop).toHaveBeenCalled();
    expect(h.track.stop).not.toHaveBeenCalled();
    h.doc.hidden = false;
    h.setClock(1200);
    h.controller.visibility();
    pending.resolve({ landmarks: null, latencyMs: 100 });
    await frame;
    expect(h.controller.analyzer.lastObservation).toBeNull();
    expect(h.controller.analyzer.stats.pausedMs).toBe(1050);
    h.controller.dispose();
  });
  it("one frame in flight, no queue; camera change preserves totals and clears calibration", async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.controller.start();
    const pending = deferred();
    h.vision.detect.mockReturnValue(pending.promise);
    h.setClock(100);
    const first = h.controller.frame(h.controller.generation);
    await vi.waitFor(() => expect(h.vision.detect).toHaveBeenCalledTimes(1));
    h.video.currentTime = 2;
    h.setClock(300);
    await h.controller.frame(h.controller.generation);
    expect(h.vision.detect).toHaveBeenCalledTimes(1);
    pending.resolve({ landmarks: null, latencyMs: 10 });
    await first;
    h.controller.analyzer.stats.warnings = 2;
    await h.controller.switchCamera("another");
    expect(h.controller.analyzer.stats.warnings).toBe(2);
    expect(h.controller.analyzer.calibration).toBeNull();
    expect(h.track.stop).toHaveBeenCalledTimes(1);
    h.controller.dispose();
  });
  it("denial, disconnect and inference failures expose actionable errors and release resources", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.mediaDevices.getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error(), { name: "NotAllowedError" }),
    );
    await h.controller.start();
    expect(h.controller.state.error).toContain("permission denied");
    expect(h.controller.analyzer.events.at(-1).code).toBe("ERROR");
    await h.controller.start();
    h.track.onended();
    expect(h.controller.state.error).toContain("disconnected");
    expect(h.track.stop).toHaveBeenCalledTimes(1);
    await h.controller.start();
    h.vision.detect.mockRejectedValue(new Error("inference failed"));
    h.setClock(1000);
    await h.controller.frame(h.controller.generation);
    expect(h.controller.state.lifecycle).toBe("ERROR");
    expect(h.controller.state.cameraOpen).toBe(false);
    h.controller.dispose();
  });
});
function audioHarness() {
  const oscillators = [],
    gains = [];
  const context = {
    state: "running",
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createOscillator: () => {
      const node = {
        frequency: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      oscillators.push(node);
      return node;
    },
    createGain: () => {
      const node = {
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(node);
      return node;
    },
  };
  let clock = 0;
  const audio = new AlarmAudio({
    contextFactory: () => context,
    now: () => clock,
  });
  return {
    audio,
    context,
    oscillators,
    gains,
    setClock: (t) => {
      clock = t;
    },
  };
}
describe("Web Audio management with mocked nodes", () => {
  it("uses one repeating loop, silences immediately, resumes after ten seconds", async () => {
    vi.useFakeTimers();
    const h = audioHarness();
    await h.audio.unlock();
    h.audio.update(true, DEFAULTS);
    h.audio.update(true, DEFAULTS);
    expect(vi.getTimerCount()).toBe(1);
    expect(h.oscillators).toHaveLength(2);
    h.audio.silence();
    expect(vi.getTimerCount()).toBe(0);
    expect(h.audio.nodes.size).toBe(0);
    h.setClock(9999);
    h.audio.update(true, DEFAULTS);
    expect(vi.getTimerCount()).toBe(0);
    h.setClock(10000);
    h.audio.update(true, DEFAULTS);
    expect(vi.getTimerCount()).toBe(1);
    h.audio.update(false, DEFAULTS);
    expect(vi.getTimerCount()).toBe(0);
    h.audio.dispose();
  });
  it("disabled sound disconnects nodes and isolated Test Alarm never adds a loop", async () => {
    vi.useFakeTimers();
    const h = audioHarness();
    await h.audio.unlock();
    h.audio.update(true, DEFAULTS);
    h.audio.update(true, { ...DEFAULTS, sound: false });
    expect(h.gains.every((g) => g.disconnect.mock.calls.length)).toBe(true);
    await h.audio.test(0.5);
    expect(vi.getTimerCount()).toBe(0);
    expect(h.audio.nodes.size).toBe(2);
    h.audio.dispose();
    expect(h.context.close).toHaveBeenCalledTimes(1);
  });
  it("Stop during delayed audio unlock cannot play a late sound check", async () => {
    vi.useFakeTimers();
    const h = audioHarness(),
      pending = deferred();
    h.context.state = "suspended";
    h.context.resume.mockReturnValue(pending.promise);
    const test = h.audio.test(0.5);
    h.audio.stop();
    h.context.state = "running";
    pending.resolve();
    await test;
    expect(h.oscillators).toHaveLength(0);
    h.audio.dispose();
  });
  it("blocked audio keeps a visible state for retry", async () => {
    const h = audioHarness();
    h.context.state = "suspended";
    h.context.resume.mockRejectedValue(new Error("blocked"));
    expect(await h.audio.unlock()).toBe(false);
    expect(h.audio.blocked).toBe(true);
    h.audio.dispose();
  });
});
