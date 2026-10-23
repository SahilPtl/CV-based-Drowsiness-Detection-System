import { describe, expect, it } from "vitest";
import {
  Analyzer,
  classifyEye,
  ClosureEpisode,
  YawnEpisode,
} from "../src/analysis/analyzer.js";
import {
  DEFAULTS,
  validateConfig,
  loadPreferences,
  savePreferences,
} from "../src/analysis/config.js";
import { RollingWindow } from "../src/analysis/rolling.js";
import { evaluateCalibration } from "../src/analysis/calibration.js";
const config = { ...DEFAULTS, smoothingTauMs: 0 };
const sample = (t, ear = 0.3, mar = 0.1, extra = {}) => ({
  t,
  faceValid: true,
  leftEAR: ear,
  rightEAR: ear,
  mar,
  mouthValid: true,
  ...extra,
});
function acquired() {
  const a = new Analyzer(config);
  a.start(0, 0);
  for (let t = 0; t <= 500; t += 100) a.observe(sample(t));
  return a;
}
function feed(a, from, to, ear, mar = 0.1, step = 100) {
  for (let t = from; t <= to; t += step) a.observe(sample(t, ear, mar));
  return a.snapshot(to);
}
describe("classification and closure contract (no smoothing)", () => {
  it("has exact inclusive boundaries and UNKNOWN hysteresis start", () => {
    expect(classifyEye(0.21, 0.21, 0.03)).toBe("CLOSED");
    expect(classifyEye(0.24, 0.21, 0.03)).toBe("OPEN");
    expect(classifyEye(0.22, 0.21, 0.03)).toBe("UNKNOWN");
    expect(classifyEye(0.22, 0.21, 0.03, "CLOSED")).toBe("CLOSED");
    expect(classifyEye(0.22, 0.21, 0.03, "OPEN")).toBe("OPEN");
  });
  it("warns at 1000, escalates at 2500, recovers at 3800", () => {
    const e = new ClosureEpisode();
    for (let t = 0; t <= 2900; t += 100)
      expect(e.update(t, "CLOSED", "CLOSED", config).level).toBe(
        t < 1000 ? 0 : t < 2500 ? 1 : 2,
      );
    for (let t = 3000; t <= 3800; t += 100)
      expect(e.update(t, "OPEN", "OPEN", config).level).toBe(t < 3800 ? 2 : 0);
  });
  it("does not warn on a 200ms blink or add separate closures", () => {
    const e = new ClosureEpisode();
    e.update(0, "CLOSED", "CLOSED", config);
    e.update(200, "OPEN", "OPEN", config);
    expect(e.level).toBe(0);
    e.update(300, "CLOSED", "CLOSED", config);
    e.update(1100, "CLOSED", "CLOSED", config);
    e.update(1200, "OPEN", "OPEN", config);
    e.update(1300, "CLOSED", "CLOSED", config);
    expect(e.update(2100, "CLOSED", "CLOSED", config).level).toBe(0);
  });
  it("brief reopening breaks duration but retains indication until full recovery", () => {
    const e = new ClosureEpisode();
    e.update(0, "CLOSED", "CLOSED", config);
    e.update(1000, "CLOSED", "CLOSED", config);
    expect(e.update(1100, "OPEN", "OPEN", config)).toMatchObject({
      level: 1,
      durationMs: 0,
    });
    expect(e.update(1400, "CLOSED", "CLOSED", config)).toMatchObject({
      level: 1,
      durationMs: 0,
    });
    expect(e.update(2500, "CLOSED", "CLOSED", config).level).toBe(1);
  });
  it.each([50, 100, 200])(
    "has comparable elapsed transitions at %ims sampling",
    (step) => {
      const a = acquired();
      feed(a, 600, 600 + 2600, 0.1, 0.1, step);
      const warning = a.events.find((e) => e.code === "WARNING"),
        critical = a.events.find((e) => e.code === "CRITICAL");
      expect(warning.t).toBeGreaterThanOrEqual(1600);
      expect(warning.t).toBeLessThan(1600 + step);
      expect(critical.t).toBeGreaterThanOrEqual(3100);
      expect(critical.t).toBeLessThan(3100 + step);
    },
  );
  it("handles jitter without accumulating observation counts", () => {
    const a = acquired();
    for (const t of [600, 690, 805, 955, 1080, 1200, 1310, 1420, 1530, 1635])
      a.observe(sample(t, 0.1));
    expect(a.stats.warnings).toBe(1);
    expect(a.events.find((e) => e.code === "WARNING").t).toBe(1635);
  });
  it("logs escalations once; downward recovery is not another warning", () => {
    const a = acquired();
    feed(a, 600, 4000, 0.1);
    expect(a.stats).toMatchObject({ warnings: 1, critical: 1 });
    feed(a, 4100, 4900, 0.3);
    expect(a.assessment).toBe("ALERT");
    feed(a, 5000, 6100, 0.1);
    expect(a.stats.warnings).toBe(2);
    expect(a.events.filter((e) => e.code === "CRITICAL")).toHaveLength(1);
  });
});
describe("unknown time, acquisition and lifecycle", () => {
  it("acquires for 500ms, excluding that time from valid observations", () => {
    const a = acquired();
    expect(a.tracking).toBe("TRACKING");
    expect(a.stats.validMs).toBe(0);
    expect(a.stats.eligibleMs).toBe(500);
    a.observe(sample(600));
    expect(a.stats.validMs).toBe(100);
  });
  it("rejects duplicates and out-of-order observations without mutations", () => {
    const a = acquired();
    const before = a.export();
    expect(a.observe(sample(500, 0.1)).accepted).toBe(false);
    expect(a.observe(sample(400, 0.1)).accepted).toBe(false);
    expect(a.export()).toEqual(before);
  });
  it("rejects invalid receive times and freezes stopped rolling statistics", () => {
    const a = acquired();
    expect(a.observe(sample(600, 0.1, 0.1, { receivedAt: NaN })).accepted).toBe(
      false,
    );
    expect(a.observe(sample(600, 0.1, 0.1, { receivedAt: 599 })).accepted).toBe(
      false,
    );
    feed(a, 600, 1500, 0.3);
    a.stop(1600);
    const rolling = a.snapshot().rolling;
    expect(a.tick(200000).rolling).toEqual(rolling);
    expect(a.snapshot(200000).stats.elapsedMs).toBe(1600);
  });
  it("a 10-second gap never becomes critical or valid closed time", () => {
    const a = acquired();
    a.observe(sample(600, 0.1));
    const valid = a.stats.validMs;
    const result = a.observe(sample(10600, 0.1));
    expect(result.status).toBe("ACQUIRING");
    expect(a.stats.critical).toBe(0);
    expect(a.stats.validMs).toBe(valid);
  });
  it.each([{ faceValid: false }, { leftEAR: null }, { receivedAt: 1201 }])(
    "immediately interrupts validity for %o",
    (extra) => {
      const a = acquired();
      feed(a, 600, 1700, 0.1);
      const t = extra.receivedAt ? 1800 : 1800;
      const result = a.observe(
        sample(t, 0.1, 0.1, extra.receivedAt ? { receivedAt: 2401 } : extra),
      );
      expect(result.measurements).toBeNull();
      expect(result.closureMs).toBeNull();
      expect(a.closure.level).toBe(0);
    },
  );
  it("watchdog marks a stalled stream unknown and reacquires without bridging", () => {
    const a = acquired();
    feed(a, 600, 1700, 0.1);
    expect(a.tick(2201).status).toBe("STALE");
    feed(a, 2300, 2800, 0.1);
    expect(a.closure.durationMs).toBe(0);
    expect(a.assessment).toBe("ALERT");
  });
  it("mouth gaps do not interrupt binocular eye analysis", () => {
    const a = acquired();
    for (let t = 600; t <= 1600; t += 100)
      a.observe(sample(t, 0.1, null, { mouthValid: false }));
    expect(a.assessment).toBe("WARNING");
    expect(a.snapshot().measurements.mar).toBeNull();
  });
  it("pause/resume excludes hidden time; old captures cannot cross resume or sessions", () => {
    const a = acquired();
    a.pause(600);
    a.resume(10600);
    expect(a.stats.pausedMs).toBe(10000);
    expect(a.stats.eligibleMs).toBe(600);
    expect(a.observe(sample(650)).accepted).toBe(false);
    a.observe(sample(10700));
    expect(a.tracking).toBe("ACQUIRING");
    a.stop(10800);
    const frozen = a.stats.elapsedMs;
    a.tick(20000);
    expect(a.stats.elapsedMs).toBe(frozen);
    a.start(20000, 0);
    expect(a.observe(sample(11000)).accepted).toBe(false);
    expect(a.stats.warnings).toBe(0);
    expect(a.stats.validMs).toBe(0);
  });
  it("EMA follows elapsed time and adds bounded onset lag", () => {
    const a = new Analyzer(DEFAULTS);
    a.start(0);
    feed(a, 0, 500, 0.3);
    a.observe(sample(600, 0.1));
    expect(a.snapshot().measurements.averageEAR).toBeCloseTo(
      0.1 + 0.2 * Math.exp(-1),
    );
  });
});
describe("possible yawn episodes", () => {
  it("counts sustained opening once and needs 500ms closed to rearm", () => {
    const y = new YawnEpisode();
    expect(y.update(0, 0.55, config)).toBe(false);
    expect(y.update(1499, 0.8, config)).toBe(false);
    expect(y.update(1500, 0.8, config)).toBe(true);
    expect(y.update(8000, 0.8, config)).toBe(false);
    y.update(8100, 0.4, config);
    y.update(8600, 0.4, config);
    y.update(8700, 0.55, config);
    expect(y.update(10200, 0.55, config)).toBe(true);
  });
  it("short movements and gaps cancel unfinished candidates; counted yawns stay disarmed", () => {
    const y = new YawnEpisode();
    y.update(0, 0.8, config);
    y.update(500, 0.2, config);
    expect(y.update(1500, 0.8, config)).toBe(false);
    y.interrupt();
    expect(y.update(3000, 0.8, config)).toBe(false);
    expect(y.update(4500, 0.8, config)).toBe(true);
    y.interrupt();
    expect(y.update(10000, 0.8, config)).toBe(false);
    expect(y.update(20000, 0.8, config)).toBe(false);
  });
  it("yawns provide context without independent warnings", () => {
    const a = acquired();
    feed(a, 600, 5000, 0.3, 0.8);
    expect(a.stats.yawns).toBe(1);
    expect(a.assessment).toBe("ALERT");
  });
});
describe("time-weighted rolling closure", () => {
  it("60s window with 15 closed seconds is 25%, independent of sample count", () => {
    const w = new RollingWindow(60000);
    w.addEligible(0, 60000);
    w.addValid(0, 15000, true);
    w.addValid(15000, 60000, false);
    expect(w.measure(60000)).toMatchObject({
      percent: 25,
      validMs: 60000,
      eligibleMs: 60000,
      coverage: 1,
    });
  });
  it("clips oldest partial intervals and does not extrapolate final observations", () => {
    const w = new RollingWindow(60000);
    w.addEligible(0, 70000);
    w.addValid(0, 15000, true);
    w.addValid(15000, 60000, false);
    expect(w.measure(70000)).toMatchObject({
      percent: 10,
      validMs: 50000,
      closedMs: 5000,
      eligibleMs: 60000,
    });
  });
  it("zero denominators are unavailable", () => {
    expect(new RollingWindow(60000).measure(0)).toMatchObject({
      percent: null,
      coverage: null,
    });
  });
  it("requires 20s valid observations and 70% coverage, losing readiness after a gap", () => {
    const a = acquired();
    feed(a, 600, 20400, 0.3);
    expect(a.snapshot().rolling.ready).toBe(false);
    a.observe(sample(20500));
    expect(a.snapshot().rolling.ready).toBe(true);
    a.tick(60500);
    expect(a.snapshot().rolling.ready).toBe(false);
  });
  it("allocates each interval to the earlier classification", () => {
    const a = acquired();
    a.observe(sample(600, 0.1));
    a.observe(sample(800, 0.3));
    a.observe(sample(1000, 0.3));
    expect(a.snapshot().rolling).toMatchObject({
      validMs: 500,
      closedMs: 200,
      percent: 40,
    });
  });
  it("rolling warning persists through closure recovery and clears with hysteresis", () => {
    const a = new Analyzer({ ...config, rollingWindowMs: 20000 });
    a.start(0);
    feed(a, 0, 500, 0.3);
    for (let t = 600; t <= 25000; t += 100)
      a.observe(sample(t, t % 1000 < 500 ? 0.1 : 0.3));
    expect(a.rollingActive).toBe(true);
    expect(a.assessment).toBe("WARNING");
    expect(a.reasons).toContain("ROLLING_CLOSURE_HIGH");
    feed(a, 25100, 28100, 0.1);
    expect(a.assessment).toBe("DROWSY");
    const warnings = a.stats.warnings;
    feed(a, 28200, 29000, 0.3);
    expect(a.assessment).toBe("WARNING");
    expect(a.stats.warnings).toBe(warnings);
    feed(a, 29100, 55000, 0.3);
    expect(a.rollingActive).toBe(false);
    expect(a.assessment).toBe("ALERT");
  });
});
describe("calibration, configuration and export", () => {
  const samples = Array.from({ length: 31 }, (_, i) => ({
    t: i * 100,
    left: 0.3,
    right: 0.32,
  }));
  it("derives per-eye median thresholds from 3s/30+ stable samples", () => {
    const r = evaluateCalibration(samples, config);
    expect(r.ok).toBe(true);
    expect(r.left.threshold).toBeCloseTo(0.21);
    expect(r.right.threshold).toBeCloseTo(0.224);
    expect(evaluateCalibration(samples.slice(0, 29), config).ok).toBe(false);
    expect(
      evaluateCalibration(
        samples.map((s, i) => ({ ...s, left: i % 2 ? 0.45 : 0.18 })),
        config,
      ).ok,
    ).toBe(false);
  });
  it("excludes calibration; cancel/failure preserves old successful thresholds", () => {
    const a = acquired();
    a.beginCalibration(600);
    feed(a, 600, 3600, 0.3);
    expect(a.calibration?.ok).toBe(true);
    expect(a.stats.calibrationMs).toBe(3000);
    expect(a.stats.validMs).toBe(0);
    const prior = a.calibration;
    a.beginCalibration(3700);
    a.cancelCalibration(3900);
    expect(a.calibration).toEqual(prior);
    a.beginCalibration(4000);
    a.tick(14000);
    expect(a.calibration).toEqual(prior);
    expect(a.calibrationOutcome.ok).toBe(false);
  });
  it("UI preferences preserve history; analysis changes reset buffers; defaults restore analyzer", () => {
    const a = acquired();
    feed(a, 600, 1800, 0.1);
    const valid = a.stats.validMs;
    a.configure(
      { ...a.config, sound: false, volume: 0.2, overlay: false },
      1800,
    );
    expect(a.assessment).toBe("WARNING");
    expect(a.snapshot().rolling.validMs).toBe(valid);
    a.configure({ ...a.config, earThreshold: 0.2 }, 1800);
    expect(a.snapshot().rolling.validMs).toBe(0);
    expect(a.stats.validMs).toBe(valid);
    a.resetDefaults(1800);
    expect(a.config).toEqual(DEFAULTS);
    expect(a.calibration).toBeNull();
  });
  it("rejects nonfinite, out of range and incoherent settings", () => {
    for (const bad of [
      { warningMs: 3000 },
      { earThreshold: NaN },
      { marClose: 0.7 },
      { rollingClearPercent: 40 },
      { volume: -1 },
      { sound: "yes" },
    ])
      expect(validateConfig({ ...DEFAULTS, ...bad }).valid).toBe(false);
  });
  it("handles malformed, obsolete and inaccessible local storage", () => {
    for (const value of [
      "{",
      '{"schema":0}',
      '{"schema":1,"config":{"volume":2}}',
    ])
      expect(loadPreferences({ getItem: () => value })).toEqual(DEFAULTS);
    expect(
      loadPreferences({
        getItem: () => {
          throw new Error();
        },
      }),
    ).toEqual(DEFAULTS);
    expect(
      savePreferences(
        {
          setItem: () => {
            throw new Error();
          },
        },
        config,
      ),
    ).toBe(false);
    let saved;
    expect(
      savePreferences(
        {
          setItem: (_, v) => {
            saved = v;
          },
        },
        config,
      ),
    ).toBe(true);
    expect(loadPreferences({ getItem: () => saved })).toEqual(config);
  });
  it("bounds/debounces events, retains counts and exports no raw observations", () => {
    const a = acquired();
    for (let i = 0; i < 150; i++) a.event("POSSIBLE_YAWN", 1000 + i * 100);
    const result = a.export();
    expect(result.events).toHaveLength(100);
    expect(result.truncatedEvents).toBeGreaterThan(0);
    expect(result.source).toBe("live");
    expect(result.landmarks).toBeUndefined();
    a.event("TRACKING_LOST", 50000);
    a.event("TRACKING_LOST", 50500);
    expect(a.events.filter((e) => e.code === "TRACKING_LOST")).toHaveLength(1);
  });
});
