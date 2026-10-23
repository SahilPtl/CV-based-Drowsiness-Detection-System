export const APP_VERSION = "1.0.0";
export const DEFAULTS = Object.freeze({
  earThreshold: 0.21,
  earHysteresis: 0.03,
  smoothingTauMs: 100,
  warningMs: 1000,
  criticalMs: 2500,
  recoveryMs: 800,
  maxGapMs: 500,
  maxResultAgeMs: 500,
  acquisitionMs: 500,
  marOpen: 0.55,
  marClose: 0.4,
  yawnMs: 1500,
  yawnRearmMs: 500,
  rollingWindowMs: 60000,
  rollingMinValidMs: 20000,
  rollingMinCoverage: 0.7,
  rollingWarnPercent: 30,
  rollingClearPercent: 25,
  rollingHoldMs: 2000,
  calibrationMinMs: 3000,
  calibrationMinSamples: 30,
  calibrationTimeoutMs: 10000,
  calibrationThresholdMin: 0.1,
  calibrationThresholdMax: 0.35,
  sound: true,
  volume: 0.55,
  overlay: true,
});
export const BOUNDS = {
  earThreshold: [0.1, 0.35],
  earHysteresis: [0.01, 0.1],
  smoothingTauMs: [0, 300],
  warningMs: [300, 5000],
  criticalMs: [500, 10000],
  recoveryMs: [300, 2000],
  maxGapMs: [100, 500],
  maxResultAgeMs: [100, 500],
  acquisitionMs: [500, 2000],
  marOpen: [0.2, 1.2],
  marClose: [0.05, 1.1],
  yawnMs: [500, 5000],
  yawnRearmMs: [300, 1500],
  rollingWindowMs: [20000, 120000],
  rollingMinValidMs: [20000, 60000],
  rollingMinCoverage: [0.7, 1],
  rollingWarnPercent: [10, 80],
  rollingClearPercent: [5, 75],
  rollingHoldMs: [1000, 5000],
  calibrationMinMs: [3000, 5000],
  calibrationMinSamples: [30, 60],
  calibrationTimeoutMs: [10000, 15000],
  calibrationThresholdMin: [0.08, 0.15],
  calibrationThresholdMax: [0.25, 0.4],
  volume: [0, 1],
};
export const PRESENTATION_KEYS = new Set(["sound", "volume", "overlay"]);
export function validateConfig(input) {
  const config = { ...DEFAULTS };
  const errors = [];
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in input)) continue;
    const value = input[key];
    if (typeof DEFAULTS[key] === "boolean") {
      if (typeof value !== "boolean") errors.push(`${key} must be on or off.`);
      else config[key] = value;
    } else if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < BOUNDS[key][0] ||
      value > BOUNDS[key][1]
    ) {
      errors.push(`${key} must be between ${BOUNDS[key].join(" and ")}.`);
    } else config[key] = value;
  }
  if (config.warningMs >= config.criticalMs)
    errors.push("Warning duration must be less than critical duration.");
  if (config.marClose >= config.marOpen)
    errors.push("Mouth closing threshold must be less than opening threshold.");
  if (config.rollingClearPercent >= config.rollingWarnPercent)
    errors.push("Rolling clear threshold must be less than warning threshold.");
  if (config.rollingMinValidMs > config.rollingWindowMs)
    errors.push("Rolling window must contain the required valid duration.");
  if (config.calibrationThresholdMin >= config.calibrationThresholdMax)
    errors.push("Calibration bounds must be ordered.");
  return { config, errors, valid: !errors.length };
}
const KEY = "vigil.preferences.v1";
export function loadPreferences(storage) {
  try {
    const value = JSON.parse(storage.getItem(KEY));
    if (
      value?.schema !== 1 ||
      !value.config ||
      typeof value.config !== "object"
    )
      return { ...DEFAULTS };
    const result = validateConfig(value.config);
    return result.valid ? result.config : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}
export function savePreferences(storage, config) {
  const result = validateConfig(config);
  if (!result.valid) return false;
  try {
    storage.setItem(KEY, JSON.stringify({ schema: 1, config: result.config }));
    return true;
  } catch {
    return false;
  }
}
