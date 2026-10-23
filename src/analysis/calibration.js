export function median(values) {
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return n
    ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2
    : null;
}
export function evaluateCalibration(samples, config) {
  if (
    samples.length < config.calibrationMinSamples ||
    samples.at(-1).t - samples[0].t < config.calibrationMinMs
  )
    return {
      ok: false,
      reason: "Need at least 3 seconds and 30 valid samples.",
    };
  const result = {};
  for (const eye of ["left", "right"]) {
    const values = samples.map((s) => s[eye]).sort((a, b) => a - b);
    const baseline = median(values);
    const mad = median(values.map((v) => Math.abs(v - baseline)));
    const spread =
      values[Math.floor((values.length - 1) * 0.9)] -
      values[Math.floor((values.length - 1) * 0.1)];
    const threshold = baseline * 0.7;
    if (
      !values.every(Number.isFinite) ||
      baseline < 0.18 ||
      baseline > 0.5 ||
      mad / baseline > 0.12 ||
      spread / baseline > 0.25 ||
      threshold < config.calibrationThresholdMin ||
      threshold > config.calibrationThresholdMax
    )
      return {
        ok: false,
        reason:
          "Samples were unstable or outside plausible open-eye bounds. Check lighting and keep eyes naturally open.",
      };
    result[eye] = { baseline, threshold, mad };
  }
  return {
    ok: true,
    ...result,
    samples: samples.length,
    durationMs: samples.at(-1).t - samples[0].t,
  };
}
export class Calibration {
  constructor(t, config) {
    this.start = t;
    this.config = config;
    this.samples = [];
    this.message = "Look forward with eyes naturally open.";
  }
  add(t, left, right) {
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      this.samples = [];
      return;
    }
    if (this.samples.length && t - this.samples.at(-1).t > this.config.maxGapMs)
      this.samples = [];
    this.samples.push({ t, left, right });
    const check = evaluateCalibration(this.samples, this.config);
    if (check.ok) return check;
    this.message = check.reason;
  }
  snapshot(t) {
    return {
      progress: Math.min(
        1,
        this.samples.length / this.config.calibrationMinSamples,
        ((this.samples.at(-1)?.t ?? t) - (this.samples[0]?.t ?? t)) /
          this.config.calibrationMinMs,
      ),
      samples: this.samples.length,
      remainingMs: Math.max(
        0,
        this.config.calibrationTimeoutMs - (t - this.start),
      ),
      message: this.message,
    };
  }
}
