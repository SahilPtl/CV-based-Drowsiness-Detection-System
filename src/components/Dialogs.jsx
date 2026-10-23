import { useEffect, useRef, useState } from "react";
import { X, RotateCcw, ScanFace, CheckCircle2 } from "lucide-react";
import { BOUNDS } from "../analysis/config.js";
export function Dialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
const fields = [
  ["earThreshold", "Shared EAR closure threshold", "ratio", 0.01],
  ["warningMs", "Closure warning duration", "ms", 100],
  ["criticalMs", "Critical closure duration", "ms", 100],
  ["marOpen", "Possible yawn opening threshold", "ratio", 0.01],
  ["marClose", "Mouth closing threshold", "ratio", 0.01],
  ["yawnMs", "Possible yawn duration", "ms", 100],
  ["rollingWindowMs", "Rolling observation window", "ms", 1000],
  ["rollingWarnPercent", "Rolling warning entry", "%", 1],
  ["rollingClearPercent", "Rolling warning clear", "%", 1],
];
const advanced = [
  ["earHysteresis", "Eye reopening margin", "ratio", 0.01],
  ["smoothingTauMs", "EAR smoothing time constant", "ms", 10],
  ["recoveryMs", "Confirmed opening recovery", "ms", 100],
  ["yawnRearmMs", "Mouth closing to rearm", "ms", 100],
  ["rollingMinValidMs", "Minimum rolling valid observation", "ms", 1000],
  ["rollingMinCoverage", "Minimum rolling coverage", "fraction", 0.01],
  ["rollingHoldMs", "Rolling threshold hold", "ms", 100],
];
export function SettingsDialog({ config, onClose, onSave, onReset }) {
  const [draft, setDraft] = useState({ ...config }),
    [errors, setErrors] = useState([]);
  const field = ([key, label, unit, step]) => (
    <label className="setting-field" key={key}>
      <span>{label}</span>
      <div>
        <input
          type="number"
          min={BOUNDS[key][0]}
          max={BOUNDS[key][1]}
          step={step}
          value={draft[key]}
          onChange={(e) =>
            setDraft({
              ...draft,
              [key]: e.target.value === "" ? "" : Number(e.target.value),
            })
          }
        />
        <small>{unit}</small>
      </div>
    </label>
  );
  return (
    <Dialog title="Detection settings" onClose={onClose}>
      <p className="dialog-intro">
        Demonstration heuristics. Analysis changes restart acquisition and the
        rolling window; session totals are retained. A new manual EAR threshold
        replaces calibration.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const result = onSave(draft);
          if (result.valid) onClose();
          else setErrors(result.errors);
        }}
      >
        <div className="settings-grid">{fields.map(field)}</div>
        <details className="advanced">
          <summary>Advanced timing & coverage</summary>
          <div className="settings-grid">{advanced.map(field)}</div>
        </details>
        <div className="settings-preferences">
          <label>
            <input
              type="checkbox"
              checked={draft.sound}
              onChange={(e) => setDraft({ ...draft, sound: e.target.checked })}
            />{" "}
            Sound alerts
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.overlay}
              onChange={(e) =>
                setDraft({ ...draft, overlay: e.target.checked })
              }
            />{" "}
            Landmark overlay
          </label>
          <label>
            Volume
            <input
              aria-label="Settings alarm volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={draft.volume}
              onChange={(e) =>
                setDraft({ ...draft, volume: Number(e.target.value) })
              }
            />
          </label>
        </div>
        {errors.length > 0 && (
          <div className="form-errors" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}
        <div className="dialog-footer">
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onReset();
              onClose();
            }}
          >
            <RotateCcw size={15} /> Reset to Defaults
          </button>
          <button type="submit" className="primary-button">
            Apply settings
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function CalibrationDialog({ state, onStart, onCancel, onClose }) {
  const [began, setBegan] = useState(false);
  const progress = state.calibrationProgress,
    outcome = began ? state.calibrationOutcome : null;
  return (
    <Dialog
      title="Calibrate for your eyes"
      onClose={() => {
        if (progress) onCancel();
        onClose();
      }}
    >
      <div className="calibration-icon">
        <ScanFace size={36} />
      </div>
      <p className="dialog-intro">
        Face the camera in even lighting. Keep one person in view, look forward,
        and hold your eyes naturally open. Stay still for at least 3 seconds and
        30 valid samples.
      </p>
      <p className="muted">
        This measures a baseline; it cannot prove that your eyes were open.
        Recalibrate when the person, camera, or lighting changes.
      </p>
      {progress && (
        <div className="calibration-progress">
          <div className="progress-track">
            <span style={{ width: `${progress.progress * 100}%` }} />
          </div>
          <strong>
            {progress.samples} samples{" "}
            <span>
              · {(progress.remainingMs / 1000).toFixed(1)} s remaining
            </span>
          </strong>
          <p>
            {state.tracking === "NO_FACE"
              ? "No face — return to the camera."
              : progress.message}
          </p>
        </div>
      )}
      {outcome && (
        <div className={`calibration-result ${outcome.ok ? "success" : ""}`}>
          {outcome.ok ? (
            <>
              <CheckCircle2 size={21} />
              <strong>Personal thresholds applied</strong>
              <p>
                Left baseline {state.calibration.left.baseline.toFixed(3)} →
                threshold {state.calibration.left.threshold.toFixed(3)}
                <br />
                Right baseline {state.calibration.right.baseline.toFixed(3)} →
                threshold {state.calibration.right.threshold.toFixed(3)}
              </p>
            </>
          ) : (
            <p>{outcome.reason}</p>
          )}
        </div>
      )}
      <div className="dialog-footer">
        <button
          className="text-button"
          onClick={() => {
            if (progress) onCancel();
            onClose();
          }}
        >
          {progress ? "Cancel calibration" : "Close"}
        </button>
        {!progress && (
          <button
            className="primary-button"
            disabled={state.lifecycle !== "RUNNING"}
            onClick={() => {
              setBegan(true);
              onStart();
            }}
          >
            {outcome ? "Try again" : "Begin calibration"}
          </button>
        )}
      </div>
    </Dialog>
  );
}
