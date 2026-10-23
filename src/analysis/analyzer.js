import {
  APP_VERSION,
  DEFAULTS,
  PRESENTATION_KEYS,
  validateConfig,
} from "./config.js";
import { RollingWindow } from "./rolling.js";
import { Calibration } from "./calibration.js";

export function classifyEye(
  value,
  threshold,
  hysteresis,
  previous = "UNKNOWN",
) {
  if (!Number.isFinite(value)) return "UNKNOWN";
  if (value <= threshold) return "CLOSED";
  if (value >= threshold + hysteresis) return "OPEN";
  return previous;
}
export class ClosureEpisode {
  constructor() {
    this.reset();
  }
  reset() {
    this.closedSince = null;
    this.openSince = null;
    this.level = 0;
    this.durationMs = 0;
  }
  update(t, left, right, c) {
    const closed = left === "CLOSED" && right === "CLOSED";
    const open = left === "OPEN" && right === "OPEN";
    const endedDuration = this.closedSince === null ? 0 : t - this.closedSince;
    if (closed) {
      this.closedSince ??= t;
      this.openSince = null;
      this.durationMs = t - this.closedSince;
      if (this.durationMs >= c.criticalMs) this.level = 2;
      else if (this.durationMs >= c.warningMs)
        this.level = Math.max(1, this.level);
    } else {
      this.closedSince = null;
      this.durationMs = 0;
      if (open) {
        this.openSince ??= t;
        if (t - this.openSince >= c.recoveryMs) this.level = 0;
      } else this.openSince = null;
    }
    return {
      level: this.level,
      durationMs: this.durationMs,
      longestCandidateMs: closed ? this.durationMs : endedDuration,
    };
  }
}
export class YawnEpisode {
  constructor() {
    this.armed = true;
    this.interrupt();
  }
  interrupt() {
    this.openSince = null;
    this.closeSince = null;
  }
  update(t, mar, c) {
    if (!Number.isFinite(mar)) {
      this.interrupt();
      return false;
    }
    if (mar >= c.marOpen) {
      this.closeSince = null;
      if (this.armed) {
        this.openSince ??= t;
        if (t - this.openSince >= c.yawnMs) {
          this.armed = false;
          this.openSince = null;
          return true;
        }
      }
    } else {
      this.openSince = null;
      if (mar <= c.marClose) {
        this.closeSince ??= t;
        if (t - this.closeSince >= c.yawnRearmMs) this.armed = true;
      } else this.closeSince = null;
    }
    return false;
  }
}
const rank = (state) => ({ ALERT: 0, WARNING: 1, DROWSY: 2 })[state] ?? -1;
export class Analyzer {
  constructor(config = DEFAULTS) {
    const validated = validateConfig(config);
    if (!validated.valid) throw new Error(validated.errors.join(" "));
    this.config = validated.config;
    this.lifecycle = "OFF";
    this.assessment = "UNKNOWN";
    this.events = [];
    this.truncatedEvents = 0;
    this.changes = [];
    this.truncatedChanges = 0;
    this.calibration = null;
    this.attempt = null;
    this.startedAt = null;
    this.stoppedAt = null;
    this.lastClock = 0;
    this.lastObservation = null;
    this.stats = {
      elapsedMs: 0,
      pausedMs: 0,
      calibrationMs: 0,
      eligibleMs: 0,
      validMs: 0,
      closedMs: 0,
      longestClosureMs: 0,
      warnings: 0,
      critical: 0,
      yawns: 0,
    };
    this.yawn = new YawnEpisode();
    this.resetAnalysis();
  }
  event(code, t, detail = "") {
    if (
      (code === "TRACKING_LOST" || code === "TRACKING_ACQUIRED") &&
      this.events.some((e) => e.code === code && t - e.t < 2000)
    )
      return;
    this.events.push({
      t,
      at: new Date(
        (this.wallStart ?? Date.now()) + t - (this.startedAt ?? t),
      ).toISOString(),
      code,
      detail,
    });
    if (this.events.length > 100) {
      this.events.shift();
      this.truncatedEvents++;
    }
  }
  change(kind, t, value) {
    this.changes.push({ t, kind, value: structuredClone(value) });
    if (this.changes.length > 100) {
      this.changes.shift();
      this.truncatedChanges++;
    }
  }
  resetContinuity() {
    this.acquireSince = null;
    this.previousEligible = null;
    this.ema = null;
    this.eyeStates = ["UNKNOWN", "UNKNOWN"];
    this.measurements = null;
    this.closure = new ClosureEpisode();
    this.yawn.interrupt();
    this.rollingActive = false;
    this.rollingEnter = null;
    this.rollingExit = null;
    this.assessment = "UNKNOWN";
    this.reasons = [];
    this.tracking = "ACQUIRING";
  }
  resetAnalysis() {
    this.rolling = new RollingWindow(this.config.rollingWindowMs);
    this.resetContinuity();
  }
  start(t, wallStart = Date.now()) {
    const fresh = new Analyzer(this.config);
    Object.assign(this, fresh);
    this.startedAt = t;
    this.lastClock = t;
    this.acceptAfter = t;
    this.wallStart = wallStart;
    this.lifecycle = "RUNNING";
    this.change("initial-configuration", t, this.config);
    this.event("SESSION_START", t, "Live camera session");
    return this.snapshot(t);
  }
  advance(t) {
    if (
      this.startedAt === null ||
      this.stoppedAt !== null ||
      t <= this.lastClock
    )
      return;
    const delta = t - this.lastClock;
    this.stats.elapsedMs += delta;
    if (this.lifecycle === "PAUSED") this.stats.pausedMs += delta;
    else if (this.attempt) this.stats.calibrationMs += delta;
    else if (this.lifecycle === "RUNNING") {
      this.stats.eligibleMs += delta;
      this.rolling.addEligible(this.lastClock, t);
    }
    this.lastClock = t;
  }
  interrupt(t, reason = "NO_FACE") {
    const wasTracked = this.tracking === "TRACKING";
    this.resetContinuity();
    this.tracking = reason;
    if (this.attempt) this.attempt.samples = [];
    if (wasTracked) this.event("TRACKING_LOST", t, reason);
  }
  pause(t) {
    if (this.lifecycle !== "RUNNING") return;
    this.advance(t);
    if (this.attempt)
      this.finishCalibration(
        t,
        { ok: false, reason: "Cancelled when the tab was hidden." },
        "CALIBRATION_CANCELLED",
      );
    this.lifecycle = "PAUSED";
    this.interrupt(t, "PAUSED");
    this.event("PAUSED", t, "Tab hidden; camera stream remains open.");
  }
  resume(t) {
    if (this.lifecycle !== "PAUSED") return;
    this.advance(t);
    this.acceptAfter = t;
    this.lifecycle = "RUNNING";
    this.interrupt(t, "ACQUIRING");
    this.event("RESUMED", t, "Reacquiring fresh observations");
  }
  stop(t, error) {
    if (this.startedAt === null || this.stoppedAt !== null) return;
    this.advance(t);
    if (this.attempt)
      this.finishCalibration(
        t,
        { ok: false, reason: "Session ended." },
        "CALIBRATION_CANCELLED",
      );
    this.stoppedAt = t;
    this.lifecycle = error ? "ERROR" : "OFF";
    this.interrupt(t, "OFF");
    if (error) this.event("ERROR", t, error);
    this.event("SESSION_STOP", t, error || "Camera released; summary frozen");
  }
  configure(input, t) {
    const result = validateConfig(input);
    if (!result.valid) return result;
    const analysisChanged = Object.keys(result.config).some(
      (k) => !PRESENTATION_KEYS.has(k) && result.config[k] !== this.config[k],
    );
    this.advance(t);
    if (analysisChanged && this.attempt)
      this.finishCalibration(
        t,
        { ok: false, reason: "Analysis settings changed." },
        "CALIBRATION_CANCELLED",
      );
    if (result.config.earThreshold !== this.config.earThreshold)
      this.calibration = null;
    this.config = result.config;
    if (analysisChanged) {
      this.acceptAfter = t;
      this.resetAnalysis();
      this.event(
        "SETTINGS_CHANGED",
        t,
        "Temporal buffers reset; session totals retained.",
      );
    }
    if (this.startedAt !== null) this.change("configuration", t, this.config);
    return result;
  }
  resetDefaults(t) {
    this.calibration = null;
    this.configure({ ...DEFAULTS }, t);
    this.resetAnalysis();
    this.change("calibration-cleared", t, null);
  }
  cameraChanged(t) {
    this.advance(t);
    if (this.attempt)
      this.finishCalibration(
        t,
        { ok: false, reason: "Camera changed." },
        "CALIBRATION_CANCELLED",
      );
    this.calibration = null;
    this.resetAnalysis();
    this.change("camera-change", t, null);
    this.event("CAMERA_CHANGED", t, "Recalibrate for this camera/person.");
  }
  beginCalibration(t) {
    if (this.lifecycle !== "RUNNING" || this.attempt) return;
    this.advance(t);
    this.acceptAfter = t;
    this.resetAnalysis();
    this.attempt = new Calibration(t, this.config);
    this.calibrationOutcome = null;
    this.event(
      "CALIBRATION_START",
      t,
      "Keep eyes naturally open; this cannot verify open eyes.",
    );
  }
  finishCalibration(t, result, code) {
    if (!this.attempt) return;
    this.advance(t);
    this.acceptAfter = t;
    this.attempt = null;
    if (result.ok) {
      this.calibration = { ...result, t };
      this.change("calibration", t, this.calibration);
    }
    this.calibrationOutcome = result;
    this.resetAnalysis();
    this.event(
      code || (result.ok ? "CALIBRATION_SUCCESS" : "CALIBRATION_FAILED"),
      t,
      result.reason || "Per-eye thresholds applied",
    );
  }
  cancelCalibration(t) {
    this.finishCalibration(
      t,
      { ok: false, reason: "Cancelled; previous calibration retained." },
      "CALIBRATION_CANCELLED",
    );
  }
  tick(t) {
    if (this.stoppedAt !== null) return this.snapshot(this.stoppedAt);
    this.advance(t);
    if (
      this.attempt &&
      t - this.attempt.start >= this.config.calibrationTimeoutMs
    )
      this.finishCalibration(t, {
        ok: false,
        reason:
          "Ten-second attempt ended without enough stable samples. Previous calibration retained.",
      });
    if (
      this.lifecycle === "RUNNING" &&
      this.lastObservation !== null &&
      t - this.lastObservation > this.config.maxGapMs &&
      !["STALE", "NO_FACE", "INVALID_EYES"].includes(this.tracking)
    )
      this.interrupt(t, "STALE");
    const rolling = this.rollingStatus(t);
    if (!rolling.ready) {
      this.rollingActive = false;
      this.rollingEnter = null;
      this.rollingExit = null;
    }
    return this.snapshot(t);
  }
  rollingStatus(t) {
    const value = this.rolling.measure(t);
    return {
      ...value,
      ready:
        value.validMs >= this.config.rollingMinValidMs &&
        value.coverage >= this.config.rollingMinCoverage,
    };
  }
  observe(o) {
    const t = o.t;
    if (
      !Number.isFinite(t) ||
      (o.receivedAt != null &&
        (!Number.isFinite(o.receivedAt) || o.receivedAt < t)) ||
      t < (this.acceptAfter ?? 0) ||
      (this.lastObservation !== null && t <= this.lastObservation) ||
      this.lifecycle !== "RUNNING"
    )
      return { ...this.snapshot(this.lastClock), accepted: false };
    const now = Math.max(t, o.receivedAt ?? t);
    const gap = this.lastObservation === null ? 0 : t - this.lastObservation;
    this.lastObservation = t;
    this.advance(now);
    if (gap > this.config.maxGapMs) this.interrupt(t, "STALE");
    const eyesValid =
      o.faceValid &&
      [o.leftEAR, o.rightEAR].every(
        (v) => Number.isFinite(v) && v >= 0 && v <= 0.8,
      );
    if (
      !eyesValid ||
      now - t > this.config.maxResultAgeMs ||
      !Number.isFinite(now)
    ) {
      this.interrupt(
        now,
        now - t > this.config.maxResultAgeMs
          ? "STALE"
          : !o.faceValid
            ? "NO_FACE"
            : "INVALID_EYES",
      );
      return { ...this.snapshot(now), accepted: true };
    }
    if (this.attempt) {
      if (now - this.attempt.start >= this.config.calibrationTimeoutMs)
        this.finishCalibration(now, {
          ok: false,
          reason: "Calibration timed out. Previous calibration retained.",
        });
      else {
        this.tracking = "CALIBRATING";
        const result = this.attempt.add(t, o.leftEAR, o.rightEAR);
        if (result?.ok) this.finishCalibration(now, result);
      }
      return { ...this.snapshot(now), accepted: true };
    }
    const alpha =
      this.ema && this.config.smoothingTauMs > 0
        ? 1 - Math.exp(-(t - this.ema.t) / this.config.smoothingTauMs)
        : 1;
    this.ema = {
      t,
      left: this.ema
        ? this.ema.left + alpha * (o.leftEAR - this.ema.left)
        : o.leftEAR,
      right: this.ema
        ? this.ema.right + alpha * (o.rightEAR - this.ema.right)
        : o.rightEAR,
    };
    const thresholds = this.thresholds();
    this.eyeStates = [
      classifyEye(
        this.ema.left,
        thresholds.left,
        this.config.earHysteresis,
        this.eyeStates[0],
      ),
      classifyEye(
        this.ema.right,
        thresholds.right,
        this.config.earHysteresis,
        this.eyeStates[1],
      ),
    ];
    if (this.eyeStates.includes("UNKNOWN")) {
      this.acquireSince = null;
      this.previousEligible = null;
      this.tracking = "ACQUIRING";
      return { ...this.snapshot(now), accepted: true };
    }
    this.acquireSince ??= t;
    if (t - this.acquireSince < this.config.acquisitionMs) {
      this.tracking = "ACQUIRING";
      return { ...this.snapshot(now), accepted: true };
    }
    if (this.tracking !== "TRACKING")
      this.event("TRACKING_ACQUIRED", t, "Fresh binocular observations");
    this.tracking = "TRACKING";
    const mouthValid =
      o.mouthValid !== false &&
      Number.isFinite(o.mar) &&
      o.mar >= 0 &&
      o.mar <= 1.5;
    this.measurements = {
      leftEAR: this.ema.left,
      rightEAR: this.ema.right,
      averageEAR: (this.ema.left + this.ema.right) / 2,
      mar: mouthValid ? o.mar : null,
      eyeStates: [...this.eyeStates],
    };
    const closed = this.eyeStates.every((s) => s === "CLOSED");
    if (
      this.previousEligible &&
      t - this.previousEligible.t <= this.config.maxGapMs
    ) {
      const dt = t - this.previousEligible.t;
      this.rolling.addValid(
        this.previousEligible.t,
        t,
        this.previousEligible.closed,
      );
      this.stats.validMs += dt;
      if (this.previousEligible.closed) this.stats.closedMs += dt;
    }
    this.previousEligible = { t, closed };
    const episode = this.closure.update(t, ...this.eyeStates, this.config);
    this.stats.longestClosureMs = Math.max(
      this.stats.longestClosureMs,
      episode.longestCandidateMs,
    );
    if (this.yawn.update(t, mouthValid ? o.mar : null, this.config)) {
      this.stats.yawns++;
      this.event(
        "POSSIBLE_YAWN",
        t,
        "Sustained mouth opening; speech can also cause this.",
      );
    }
    const rolling = this.rollingStatus(now);
    if (!rolling.ready) {
      this.rollingActive = false;
      this.rollingEnter = null;
      this.rollingExit = null;
    } else if (!this.rollingActive) {
      this.rollingExit = null;
      if (rolling.percent >= this.config.rollingWarnPercent) {
        this.rollingEnter ??= t;
        if (t - this.rollingEnter >= this.config.rollingHoldMs)
          this.rollingActive = true;
      } else this.rollingEnter = null;
    } else {
      this.rollingEnter = null;
      if (rolling.percent <= this.config.rollingClearPercent) {
        this.rollingExit ??= t;
        if (t - this.rollingExit >= this.config.rollingHoldMs)
          this.rollingActive = false;
      } else this.rollingExit = null;
    }
    const next =
      episode.level === 2
        ? "DROWSY"
        : episode.level === 1 || this.rollingActive
          ? "WARNING"
          : "ALERT";
    this.reasons = [];
    if (episode.level)
      this.reasons.push(
        episode.level === 2
          ? "PROLONGED_CLOSURE_CRITICAL"
          : "PROLONGED_CLOSURE_WARNING",
      );
    if (this.rollingActive) this.reasons.push("ROLLING_CLOSURE_HIGH");
    if (rank(next) >= 1 && rank(this.assessment) < 1) {
      this.stats.warnings++;
      this.event("WARNING", t, this.reasons.join(", "));
    }
    if (next === "DROWSY" && this.assessment !== "DROWSY") {
      this.stats.critical++;
      this.event("CRITICAL", t, this.reasons.join(", "));
    }
    if (rank(this.assessment) > rank(next))
      this.event("RECOVERY", t, `Assessment now ${next}`);
    this.assessment = next;
    return { ...this.snapshot(now), accepted: true };
  }
  thresholds() {
    return {
      left: this.calibration?.left.threshold ?? this.config.earThreshold,
      right: this.calibration?.right.threshold ?? this.config.earThreshold,
    };
  }
  snapshot(t = this.lastClock) {
    t = this.stoppedAt ?? t;
    const status =
      this.lifecycle !== "RUNNING"
        ? this.lifecycle
        : this.attempt
          ? ["NO_FACE", "INVALID_EYES", "STALE"].includes(this.tracking)
            ? this.tracking
            : "CALIBRATING"
          : this.tracking !== "TRACKING"
            ? this.tracking
            : this.assessment;
    return {
      lifecycle: this.lifecycle,
      status,
      assessment: this.assessment,
      tracking: this.tracking,
      reasons: [...this.reasons],
      measurements:
        this.tracking === "TRACKING" && !this.attempt
          ? this.measurements
          : null,
      closureMs:
        this.tracking === "TRACKING" && !this.attempt
          ? this.closure.durationMs
          : null,
      rolling: this.rollingStatus(t),
      stats: {
        ...this.stats,
        coverage: this.stats.eligibleMs
          ? this.stats.validMs / this.stats.eligibleMs
          : null,
      },
      events: [...this.events],
      calibration: this.calibration,
      calibrationOutcome: this.calibrationOutcome,
      calibrationProgress: this.attempt?.snapshot(t) ?? null,
      thresholds: this.thresholds(),
    };
  }
  export(t = this.lastClock) {
    return {
      schemaVersion: 1,
      appVersion: APP_VERSION,
      source: "live",
      experimental: true,
      startedAt:
        this.startedAt === null ? null : new Date(this.wallStart).toISOString(),
      endedAt:
        this.stoppedAt === null
          ? null
          : new Date(
              this.wallStart + this.stoppedAt - this.startedAt,
            ).toISOString(),
      effectiveConfiguration: { ...this.config },
      calibration: this.calibration,
      changes: structuredClone(this.changes),
      truncatedChanges: this.truncatedChanges,
      statistics: this.snapshot(t).stats,
      events: [...this.events],
      truncatedEvents: this.truncatedEvents,
      note: "Educational heuristic prototype; no medical or real-driving validation. No images or raw landmarks.",
    };
  }
}
