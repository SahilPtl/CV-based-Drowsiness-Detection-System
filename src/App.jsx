import { useRef, useState } from "react";
import {
  Activity,
  Bell,
  BellOff,
  Camera,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Eye,
  LayoutDashboard,
  Play,
  ScanFace,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import { useMonitor } from "./hooks/useMonitor.js";
import CameraPanel from "./components/CameraPanel.jsx";
import EarChart from "./components/EarChart.jsx";
import { CalibrationDialog, SettingsDialog } from "./components/Dialogs.jsx";
const number = (value, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : "—";
const seconds = (value) =>
  Number.isFinite(value) ? `${(value / 1000).toFixed(1)} s` : "—";
const duration = (value) =>
  `${String(Math.floor((value || 0) / 60000)).padStart(2, "0")}:${String(Math.floor((value || 0) / 1000) % 60).padStart(2, "0")}`;
const statusText = {
  OFF: [
    "Camera off",
    "Ready when you are. Start a session to begin local monitoring.",
  ],
  LOADING: ["Getting ready", "Camera and local vision model are initializing."],
  ERROR: [
    "Setup needs attention",
    "Resolve the issue below, then select Start to retry.",
  ],
  PAUSED: [
    "Monitoring paused",
    "This tab was hidden. Camera remains open; analysis and alarms are paused.",
  ],
  UNKNOWN: ["Awaiting observations", "No confirmed driver assessment yet."],
  ACQUIRING: [
    "Acquiring face",
    "Keep your face in view. Waiting for 500 ms of fresh, decisive eye observations.",
  ],
  NO_FACE: [
    "No face in view",
    "Look forward and keep one person in the frame.",
  ],
  INVALID_EYES: [
    "Eyes not clear",
    "Face forward, improve lighting, and remove eye occlusions.",
  ],
  STALE: [
    "Tracking interrupted",
    "Fresh observations stopped. Check your camera and browser performance.",
  ],
  CALIBRATING: [
    "Calibrating",
    "Collecting a personal baseline. Fatigue analysis and alarms are suspended.",
  ],
  ALERT: ["Alert", "No active fatigue rule. Continue facing the camera."],
  WARNING: [
    "Attention needed",
    "A fatigue heuristic is active. See the reason below.",
  ],
  DROWSY: [
    "Drowsiness detected",
    "Prolonged eye closure. Critical visual and audible alert is active.",
  ],
};
const reasonText = {
  PROLONGED_CLOSURE_WARNING:
    "Continuous eye closure reached the warning duration",
  PROLONGED_CLOSURE_CRITICAL:
    "Prolonged closure · confirmed opening needed for recovery",
  ROLLING_CLOSURE_HIGH: "Elevated rolling eye-closure percentage",
};
const eventNames = {
  SESSION_START: "Session started",
  SESSION_STOP: "Session stopped",
  TRACKING_ACQUIRED: "Face tracking acquired",
  TRACKING_LOST: "Tracking interrupted",
  WARNING: "Warning episode",
  CRITICAL: "Critical escalation",
  RECOVERY: "Assessment recovered",
  POSSIBLE_YAWN: "Possible yawn",
  CALIBRATION_START: "Calibration started",
  CALIBRATION_SUCCESS: "Calibration complete",
  CALIBRATION_FAILED: "Calibration failed",
  CALIBRATION_CANCELLED: "Calibration cancelled",
  SETTINGS_CHANGED: "Analysis settings changed",
  PAUSED: "Monitoring paused",
  RESUMED: "Monitoring resumed",
  ERROR: "Session error",
  CAMERA_CHANGED: "Camera changed",
};
function Metric({ icon: Icon, label, value, detail, accent }) {
  return (
    <section className={`metric panel ${accent || ""}`}>
      <div className="metric-title">
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <div className="metric-value">{value}</div>
      <p>{detail}</p>
    </section>
  );
}
export default function App() {
  const videoRef = useRef(null),
    { state, controller, configure, resetDefaults } = useMonitor(videoRef);
  const [settings, setSettings] = useState(false),
    [calibrating, setCalibrating] = useState(false),
    [camera, setCamera] = useState("");
  const active = ["LOADING", "RUNNING", "PAUSED"].includes(state.lifecycle);
  const measurement = state.measurements,
    status = statusText[state.status] || statusText.UNKNOWN;
  const tone =
    state.status === "DROWSY"
      ? "danger"
      : state.status === "WARNING"
        ? "warning"
        : state.status === "ALERT"
          ? "healthy"
          : state.status === "ERROR"
            ? "danger"
            : "neutral";
  const call = (method, ...args) => controller.current?.[method](...args);
  function exportSession() {
    const data = call("export");
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vigil-session-${new Date().toISOString().replaceAll(":", "-")}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand-symbol"
          href="#overview"
          aria-label="VIGIL overview"
        >
          V<span />
        </a>
        <nav aria-label="Sections">
          <a href="#overview" className="nav-active" aria-label="Dashboard">
            <LayoutDashboard size={21} />
          </a>
          <a href="#signals" aria-label="Live eye signal">
            <ChartNoAxesCombined size={21} />
          </a>
          <a href="#session" aria-label="Session summary">
            <Clock3 size={21} />
          </a>
          <button onClick={() => setSettings(true)} aria-label="Open settings">
            <Settings2 size={21} />
          </button>
        </nav>
        <a
          className="sidebar-help"
          href="#how-it-works"
          aria-label="How detection works"
        >
          <CircleHelp size={21} />
        </a>
        <span className="sidebar-label">IPCV</span>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <a className="wordmark" href="#overview">
            VIGIL<span>AI DRIVER MONITORING</span>
          </a>
          <div className="topbar-right">
            <span className="local-badge">
              <ShieldCheck size={14} /> Local processing
            </span>
            <span className="project-label">
              MNNIT ALLAHABAD <span>IPCV PROJECT / 2026</span>
            </span>
          </div>
        </header>
        <main id="overview">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                VISION INTELLIGENCE <ChevronRight size={12} /> LIVE MONITOR
              </div>
              <h1>Stay aware. Stay present.</h1>
              <p>Real-time eye and mouth activity, processed on your device.</p>
            </div>
            <div className="main-actions">
              <button
                className="secondary-button settings-button"
                onClick={() => setSettings(true)}
              >
                <SlidersHorizontal size={16} /> Settings
              </button>
              <button
                className={active ? "stop-button" : "primary-button"}
                onClick={() => (active ? call("stop") : call("start", camera))}
              >
                {active ? (
                  <Square size={15} fill="currentColor" />
                ) : (
                  <Play size={16} fill="currentColor" />
                )}
                {active
                  ? "Stop session"
                  : state.lifecycle === "ERROR"
                    ? "Start · retry"
                    : "Start session"}
              </button>
            </div>
          </div>
          <div className="monitor-grid">
            <CameraPanel
              videoRef={videoRef}
              state={state}
              selectedCamera={camera}
              setSelectedCamera={(id) => {
                setCamera(id);
                call("switchCamera", id);
              }}
              onCalibrate={() => setCalibrating(true)}
              onOverlay={() =>
                configure({ ...state.config, overlay: !state.config.overlay })
              }
            />
            <section
              className={`panel assessment-panel ${tone}`}
              aria-label="Driver assessment"
            >
              <div className="panel-heading">
                <span>
                  <Activity size={17} /> Driver assessment
                </span>
                <span className="tiny-label">LIVE</span>
              </div>
              <div className="assessment-main">
                <div className={`assessment-orb ${tone}`}>
                  <Eye size={30} strokeWidth={1.5} />
                </div>
                <div className="assessment-status" aria-live="polite">
                  <h2>{status[0]}</h2>
                  <span className="status-subtitle">
                    {state.status === "ALERT"
                      ? "NO ACTIVE FATIGUE RULE"
                      : state.status === "OFF"
                        ? "AWAITING SESSION"
                        : state.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="status-description">
                  {state.error || state.progress || status[1]}
                </p>
                {state.reasons?.length > 0 && state.lifecycle === "RUNNING" && (
                  <ul className="reason-list">
                    {state.reasons.map((reason) => (
                      <li key={reason}>{reasonText[reason]}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="eye-readings">
                <div>
                  <span>LEFT EAR</span>
                  <strong>{number(measurement?.leftEAR, 3)}</strong>
                </div>
                <div>
                  <span>RIGHT EAR</span>
                  <strong>{number(measurement?.rightEAR, 3)}</strong>
                </div>
                <div>
                  <span>MOUTH RATIO</span>
                  <strong>{number(measurement?.mar, 3)}</strong>
                </div>
              </div>
              <div className="calibration-status">
                <ScanFace size={14} />
                <span>
                  {state.calibration
                    ? `Calibrated · L ${number(state.thresholds.left, 3)} / R ${number(state.thresholds.right, 3)}`
                    : `Uncalibrated · EAR threshold ${number(state.config.earThreshold)}`}
                </span>
              </div>
            </section>
          </div>
          <div className="metrics-grid">
            <Metric
              icon={Eye}
              label="Average eye ratio"
              value={number(measurement?.averageEAR, 3)}
              detail="EAR · binocular, smoothed"
              accent="metric-cyan"
            />
            <Metric
              icon={Clock3}
              label="Continuous closure"
              value={seconds(state.closureMs)}
              detail={`Warning ${seconds(state.config.warningMs)} / critical ${seconds(state.config.criticalMs)}`}
            />
            <Metric
              icon={ChartNoAxesCombined}
              label="Rolling eye closure"
              value={
                <>
                  {number(state.rolling.percent, 1)}
                  <small>%</small>
                </>
              }
              detail={`${state.rolling.ready ? "Ready" : "Provisional"} · ${seconds(state.rolling.validMs)} valid / ${number(state.rolling.coverage === null ? null : state.rolling.coverage * 100, 0)}% coverage`}
            />
            <Metric
              icon={Waves}
              label="Possible yawns"
              value={state.stats.yawns.toString().padStart(2, "0")}
              detail="Sustained mouth opening events"
            />
          </div>
          <div className="details-grid">
            <section id="signals" className="panel chart-panel">
              <div className="panel-heading">
                <span>
                  <ChartNoAxesCombined size={17} /> Eye activity
                </span>
                <div className="chart-legend">
                  <span>
                    <i />
                    Average EAR
                  </span>
                  <span className="threshold-legend">
                    <i />
                    Closure threshold
                  </span>
                  <b>60 SEC</b>
                </div>
              </div>
              <EarChart history={state.history} thresholds={state.thresholds} />
              <div className="chart-foot">
                <span>Missing observations appear as gaps.</span>
                <span>
                  {state.latencyMs
                    ? `${number(state.latencyMs, 0)} ms inference · ${number(state.rateHz, 1)} updates/s`
                    : "Waiting for live inference"}
                </span>
              </div>
            </section>
            <section className="panel audio-panel">
              <div className="panel-heading">
                <span>
                  <Volume2 size={17} /> Alert controls
                </span>
                <button
                  className={`toggle ${state.config.sound ? "on" : ""}`}
                  role="switch"
                  aria-label="Enable sound alerts"
                  aria-checked={state.config.sound}
                  onClick={() =>
                    configure({ ...state.config, sound: !state.config.sound })
                  }
                >
                  <span />
                </button>
              </div>
              <div className="volume-row">
                {state.config.sound ? (
                  <Volume2 size={17} />
                ) : (
                  <VolumeX size={17} />
                )}
                <input
                  aria-label="Alarm volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={state.config.volume}
                  onChange={(e) =>
                    configure({
                      ...state.config,
                      volume: Number(e.target.value),
                    })
                  }
                />
                <span>{Math.round(state.config.volume * 100)}%</span>
              </div>
              <div className="audio-buttons">
                <button
                  className="secondary-button"
                  onClick={() => call("testAlarm")}
                >
                  <Bell size={15} /> Test Alarm
                </button>
                <button
                  className="secondary-button"
                  disabled={state.status !== "DROWSY"}
                  onClick={() => call("silence")}
                >
                  <BellOff size={15} />{" "}
                  {state.silenceRemainingMs > 0
                    ? `${Math.ceil(state.silenceRemainingMs / 1000)}s silenced`
                    : "Silence 10s"}
                </button>
              </div>
              <p>
                {state.audioBlocked
                  ? "Audio blocked. Select Test Alarm to enable browser sound."
                  : "Critical alerts repeat while eligible. Warnings are visual."}
              </p>
            </section>
          </div>
          <div className="details-grid bottom-grid">
            <section id="session" className="panel session-panel">
              <div className="panel-heading">
                <span>
                  <Clock3 size={17} /> Session summary
                </span>
                <button
                  className="text-button"
                  disabled={!state.hasSession}
                  onClick={exportSession}
                >
                  <Download size={14} /> Export JSON
                </button>
              </div>
              <div className="session-top">
                <div>
                  <span>SESSION ELAPSED</span>
                  <strong>{duration(state.stats.elapsedMs)}</strong>
                  <small>
                    {state.hasSession && !active
                      ? "Final summary"
                      : "Current session"}
                  </small>
                </div>
                <div>
                  <span>WARNINGS</span>
                  <strong className="amber-text">
                    {state.stats.warnings.toString().padStart(2, "0")}
                  </strong>
                </div>
                <div>
                  <span>CRITICAL</span>
                  <strong className="red-text">
                    {state.stats.critical.toString().padStart(2, "0")}
                  </strong>
                </div>
                <div>
                  <span>LONGEST CLOSURE</span>
                  <strong>{seconds(state.stats.longestClosureMs)}</strong>
                </div>
              </div>
              <div className="session-breakdown">
                <span>
                  Eligible monitoring <b>{duration(state.stats.eligibleMs)}</b>
                </span>
                <span>
                  Valid observed <b>{duration(state.stats.validMs)}</b>
                </span>
                <span>
                  Observation coverage{" "}
                  <b>
                    {number(
                      state.stats.coverage === null
                        ? null
                        : state.stats.coverage * 100,
                      1,
                    )}
                    %
                  </b>
                </span>
                <span>
                  Paused <b>{duration(state.stats.pausedMs)}</b>
                </span>
                <span>
                  Calibration <b>{duration(state.stats.calibrationMs)}</b>
                </span>
                <span>
                  Source <b>Live camera</b>
                </span>
              </div>
            </section>
            <section className="panel timeline-panel">
              <div className="panel-heading">
                <span>
                  <Activity size={17} /> Event timeline
                </span>
                <span className="tiny-label">RECENT 100</span>
              </div>
              <div className="timeline-list">
                {state.events.length ? (
                  [...state.events].reverse().map((event, index) => (
                    <div
                      className={`timeline-event event-${event.code.toLowerCase()}`}
                      key={`${event.t}-${event.code}-${index}`}
                    >
                      <i />
                      <div>
                        <strong>{eventNames[event.code] || event.code}</strong>
                        <p>{event.detail}</p>
                        <code>{event.code}</code>
                      </div>
                      <time dateTime={event.at}>
                        {new Date(event.at).toLocaleTimeString([], {
                          hour12: false,
                        })}
                      </time>
                    </div>
                  ))
                ) : (
                  <div className="timeline-empty">
                    <Activity size={24} />
                    <p>A clear record of your session.</p>
                    <span>
                      Tracking, calibration, and fatigue events appear here.
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>
          <section id="how-it-works" className="how-panel">
            <div>
              <span className="eyebrow">BEHIND THE SIGNAL</span>
              <h2>How detection works</h2>
            </div>
            <div className="pipeline">
              {[
                [Camera, "Webcam"],
                [ScanFace, "Pretrained landmarks"],
                [Eye, "EAR / MAR geometry"],
                [Clock3, "Temporal & rolling rules"],
                [Activity, "Assessment"],
                [Bell, "Alerts"],
              ].map(([Icon, label], i) => (
                <div key={label}>
                  <span>
                    <Icon size={17} />
                    {label}
                  </span>
                  {i < 5 && <ChevronRight size={14} />}
                </div>
              ))}
            </div>
            <p>
              Landmarks use a pretrained ML model. Fatigue rules are geometric
              and temporal heuristics. Possible yawns may also be speech or
              deliberate mouth opening.
            </p>
          </section>
          <footer>
            <p>
              <ShieldCheck size={14} /> Educational prototype · Not medically
              validated or suitable as a real driving safety system.
            </p>
            <span>VIGIL / v1.0.0</span>
          </footer>
        </main>
      </div>
      {settings && (
        <SettingsDialog
          config={state.config}
          onClose={() => setSettings(false)}
          onSave={configure}
          onReset={resetDefaults}
        />
      )}
      {calibrating && (
        <CalibrationDialog
          state={state}
          onClose={() => setCalibrating(false)}
          onStart={() => call("calibrate")}
          onCancel={() => call("cancelCalibration")}
        />
      )}
    </div>
  );
}
