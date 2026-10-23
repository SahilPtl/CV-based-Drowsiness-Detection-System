import { useEffect, useRef } from "react";
import {
  Camera,
  ScanFace,
  Eye,
  EyeOff,
  Maximize,
  ShieldCheck,
} from "lucide-react";
import { LEFT_EYE, RIGHT_EYE, MOUTH_OUTLINE } from "../analysis/geometry.js";
export default function CameraPanel({
  videoRef,
  state,
  selectedCamera,
  setSelectedCamera,
  onCalibrate,
  onOverlay,
}) {
  const canvasRef = useRef(null),
    surfaceRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current,
      surface = surfaceRef.current;
    function draw() {
      const { width, height } = surface.getBoundingClientRect(),
        dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      if (!state.config.overlay || !state.overlay) return;
      const {
        width: imageWidth,
        height: imageHeight,
        landmarks,
      } = state.overlay;
      const scale = Math.min(width / imageWidth, height / imageHeight),
        offsetX = (width - imageWidth * scale) / 2,
        offsetY = (height - imageHeight * scale) / 2;
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = state.status === "DROWSY" ? "#ff7181" : "#73e2dc";
      ctx.fillStyle = ctx.strokeStyle;
      for (const contour of [LEFT_EYE, RIGHT_EYE, MOUTH_OUTLINE]) {
        if (contour.some((index) => !landmarks[index])) continue;
        ctx.beginPath();
        contour.forEach((index, i) => {
          const p = landmarks[index],
            x = offsetX + p.x * imageWidth * scale,
            y = offsetY + p.y * imageHeight * scale;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
        for (const index of contour) {
          const p = landmarks[index];
          ctx.beginPath();
          ctx.arc(
            offsetX + p.x * imageWidth * scale,
            offsetY + p.y * imageHeight * scale,
            2,
            0,
            2 * Math.PI,
          );
          ctx.fill();
        }
      }
    }
    const observer = new ResizeObserver(draw);
    observer.observe(surface);
    draw();
    return () => observer.disconnect();
  }, [state.overlay, state.config.overlay, state.status]);
  return (
    <section
      className={`panel camera-panel ${state.status === "DROWSY" ? "critical-border" : ""}`}
      aria-label="Live camera"
    >
      <div className="panel-heading">
        <span>
          <Camera size={17} /> Live camera
        </span>
        <span className={`pill ${state.cameraOpen ? "cyan" : ""}`}>
          <i />
          {state.cameraOpen ? "CAMERA ON" : "CAMERA OFF"}
        </span>
      </div>
      <div ref={surfaceRef} className="camera-surface">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={state.cameraOpen ? "" : "inactive"}
          aria-label="Mirrored live camera preview"
        />
        <canvas
          ref={canvasRef}
          className="landmark-overlay"
          aria-hidden="true"
        />
        {!state.cameraOpen && (
          <div className="camera-empty">
            <div className="reticle">
              <span />
              <ScanFace size={54} strokeWidth={1} />
              <span />
            </div>
            <h2>Your focus. In view.</h2>
            <p>Start a session to monitor eye and mouth activity.</p>
            <span className="privacy-note">
              <ShieldCheck size={14} /> Camera frames stay in this browser
            </span>
          </div>
        )}
        {state.cameraOpen && (
          <>
            <div className="camera-tag">
              <i
                className={
                  state.tracking === "TRACKING" ? "dot-green" : "dot-amber"
                }
              />
              {state.lifecycle === "PAUSED"
                ? "Monitoring paused · camera still on"
                : state.tracking === "TRACKING"
                  ? "Primary face tracked"
                  : state.progress || "Keep one person in view"}
            </div>
            <div className="camera-caption">
              MIRRORED PREVIEW <span>{state.mode || "INITIALIZING"}</span>
            </div>
          </>
        )}
        {state.status === "DROWSY" && (
          <div className="critical-banner" role="alert">
            PROLONGED EYE CLOSURE · OPEN YOUR EYES
          </div>
        )}
      </div>
      <div className="camera-toolbar">
        <label className="camera-select">
          <Camera size={15} />
          <span className="sr-only">Camera device</span>
          <select
            aria-label="Camera device"
            value={selectedCamera}
            disabled={state.lifecycle === "LOADING"}
            onChange={(e) => setSelectedCamera(e.target.value)}
          >
            <option value="">Default camera</option>
            {state.devices
              .filter((d) => d.id)
              .map((d) => (
                <option value={d.id} key={d.id}>
                  {d.label}
                </option>
              ))}
          </select>
        </label>
        <div className="toolbar-actions">
          <button
            className="icon-button"
            onClick={onOverlay}
            aria-label={
              state.config.overlay
                ? "Hide landmark overlay"
                : "Show landmark overlay"
            }
            aria-pressed={state.config.overlay}
          >
            {state.config.overlay ? <Eye size={17} /> : <EyeOff size={17} />}
          </button>
          <button
            className="icon-button fullscreen"
            aria-label="Fullscreen camera"
            onClick={() =>
              surfaceRef.current.requestFullscreen?.().catch(() => {})
            }
          >
            <Maximize size={16} />
          </button>
          <button
            className="small-button"
            disabled={state.lifecycle !== "RUNNING"}
            onClick={onCalibrate}
          >
            <ScanFace size={15} /> Calibrate
          </button>
        </div>
      </div>
    </section>
  );
}
