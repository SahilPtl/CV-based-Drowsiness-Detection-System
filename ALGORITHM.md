# Detection contract

All fatigue rules live in `src/analysis/`. React does not independently infer fatigue. `Analyzer.observe()` accepts `{t, receivedAt, faceValid, leftEAR, rightEAR, mar, mouthValid}`; output includes measurements, lifecycle, assessment, tracking, reasons, totals and bounded events. The browser adapter creates observations from real model landmarks. Synthetic observations are used only in tests.

This is an educational heuristic, not a clinical fatigue model or validated driving safety device. No training dataset or custom model training was used.

## Landmarks and geometry

The selected MediaPipe topology uses these six eye points, in P1–P6 order:

| Subject's anatomical eye | P1 | P2 | P3 | P4 | P5 | P6 |
| --- | --- | --- | --- | --- | --- | --- |
| Left | 362 | 385 | 387 | 263 | 373 | 380 |
| Right | 33 | 160 | 158 | 133 | 153 | 144 |

P1/P4 are opposing corners, P2/P3 upper contour, P5/P6 lower contour. Subject-left/right mapping and contour membership were checked against Google's [FaceMesh connection source](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/face_mesh_connections.py). Inference sees the original unmirrored camera frame. Only preview and overlay are mirrored, once each.

```text
x_px = landmark.x × inferenceImageWidth
y_px = landmark.y × inferenceImageHeight
d(a,b) = sqrt((a.x-b.x)^2 + (a.y-b.y)^2)
EAR = (d(P2,P6) + d(P3,P5)) / (2 × d(P1,P4))
average EAR = (left EAR + right EAR) / 2
MAR = d(13,14) / d(61,291)
```

The mouth formula is **this project's normalized inner-lip opening divided by mouth width**. Other MAR definitions have different scales. Indices 13/14 are inner-lip center points and 61/291 the lateral mouth endpoints in this topology. Do not mix dlib 68-point conventions with these indices.

Distances use actual pixel dimensions of the downscaled inference image. Maximum dimensions are 640×480, preserving camera aspect ratio (for example 640×360 for 16:9). Independently normalized x/y distances would distort the ratios. Tests represent identical pixel geometry at square, 4:3 and 16:9 aspect ratios and expect EAR 0.300 and MAR 0.500.

Missing/nonfinite coordinates, coordinates beyond the conservative normalized range [-0.1,1.1], eye width under 2 pixels, mouth width under 3 pixels, EAR above 0.8, or MAR above 1.5 are unavailable. **EAR zero remains valid**: closed eyes must not be rejected as tracking loss. These checks do not guarantee correct landmark placement. There are no invented per-landmark confidence scores. Eye/mouth validity is separate; missing mouth geometry does not disable valid eye analysis. Both eyes must be valid to classify binocular closure.

The local pretrained model is initialized in VIDEO mode with `numFaces: 1`, detection/presence/tracking thresholds all 0.5, and unnecessary blendshape/matrix outputs disabled. It does not verify identity or reliably detect extra people. Use one person in view. The [official web API guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) describes these model options and synchronous inference.

## Defaults and units

All defaults and validation bounds are in `src/analysis/config.js`. Durations are milliseconds internally.

| Rule | Default |
| --- | --- |
| Per-eye uncalibrated closure threshold | EAR <= 0.21 |
| Reopening margin | +0.03 (open at >= threshold + margin) |
| Smoothing | elapsed-time EMA, tau 100 ms |
| Warning / critical closure | 1000 / 2500 ms |
| Confirmed binocular opening recovery | 800 ms |
| Maximum gap / result age | 500 / 500 ms |
| Consecutive fresh acquisition | 500 ms |
| MAR opening / closing | >=0.55 / <=0.40 |
| Possible-yawn duration / rearm closing | 1500 / 500 ms |
| Rolling window | 60000 ms |
| Rolling readiness | >=20000 ms valid and >=70% coverage |
| Rolling warning entry / clear | >=30% / <=25% |
| Rolling entry/clear hold | 2000 ms each |
| Calibration minimum | 3000 ms and 30 samples |
| Calibration attempt limit | 10000 ms |
| Calibration closure multiplier | 0.70 of each median baseline |
| Accepted calibrated threshold | 0.10–0.35 (configurable bounds) |
| Initial sound / volume / overlays | enabled / 55% / visible |

## Time, smoothing, eye episodes

Timestamps originate from `performance.now()` at frame capture. Worker inference duration and result age are measured separately. Inference latency is not added to closure duration. Duplicate/out-of-order timestamps and nonfinite or impossible receive times are rejected without changing state. A lifecycle boundary also rejects captures from before the new session/resume/configuration/calibration boundary.

For each valid eye, `alpha = 1 - exp(-dt/tau)`. The EMA is seeded from the first valid value after interruption. It adds onset/reopening lag, generally around one or a few 83–133 ms sampling periods depending on the value transition. Setting tau to zero is used in deterministic timing tests, not the initial UI preference.

Each eye begins UNKNOWN. Values <= its threshold classify CLOSED; values >= threshold+0.03 classify OPEN. Inside the band, the previous classification is retained. Acquisition requires decisive, fresh binocular classifications for 500 ms; its time is unknown for fatigue statistics. A valid face may have very low EAR.

Continuous binocular closure starts on the first eligible sample where both eyes are CLOSED. A known reopening of either eye immediately breaks the current duration. An existing warning/critical indication remains until both eyes are continuously OPEN for 800 ms. Renewed closure resets the opening timer and begins a new closure timer. Separate short closures are never added together.

The closure episode module is tested independently of EMA/acquisition: samples every 100 ms starting closed at t=0 warn at 1000, become DROWSY at 2500; open samples from 3000 recover at 3800. A 200 ms blink does not warn. A 10-second observation gap is unknown time, never prolonged closure.

Each upward assessment transition is logged once. Entry from a lower severity into WARNING or DROWSY increments warning count; entry into DROWSY increments critical count. DROWSY→WARNING is recovery, not a new warning. Unchanged-severity reason updates add no duplicate event. Eye episodes end at confirmed recovery or tracking interruption.

## Rolling closure and coverage

`RollingWindow` stores half-open intervals `[start,end)`. For consecutive eligible known eye observations separated by <=500 ms, the intervening time is allocated to the **earlier** binocular classification (sample-and-hold). A known pair that is not both CLOSED counts as not closed. Unknown/acquisition/calibration/pause intervals do not enter valid duration. The last sample is never extrapolated without a second eligible endpoint. Adjacent equal intervals merge; obsolete intervals are removed and the oldest overlapping interval is clipped at the window boundary.

```text
eye closure % = 100 × valid closed milliseconds / valid observed milliseconds
coverage = valid observed milliseconds / eligible RUNNING milliseconds
```

Eligible RUNNING time includes missing tracking and acquisition, but excludes calibration and explicit hidden-tab pauses. Only the available part of the rolling window counts; it is not automatically divided by 60 seconds at startup. Zero denominators produce unavailable values. For example, 15 closed seconds in a fully valid 60-second window gives 25%. Tests also cover partial clipping and uneven sampling.

Until at least 20 seconds valid and 70% coverage, the displayed ratio is **provisional** and cannot affect severity. Once ready, >=30% held 2 seconds raises a rolling WARNING reason. <=25% held 2 seconds clears it. Lost readiness clears it immediately. A tracking interruption cancels its active state/hold timers and requires reacquisition; subsequent activation needs a new 2-second hold. Rolling warning never independently produces DROWSY.

This is a **PERCLOS-style ratio using the chosen EAR classification**, including brief blinks. It does not measure a standardized percentage of eyelid occlusion or establish clinical PERCLOS validity. An active rolling warning survives recovery of the continuous-closure reason. The displayed severity is the maximum applicable rule, with explicit reasons and no opaque probability/score.

## Possible yawns

Valid MAR >=0.55 continuously for 1500 ms produces one POSSIBLE_YAWN. Holding the mouth open cannot produce more events. MAR <=0.40 continuously for 500 ms rearms. Values between the thresholds interrupt the candidate/closing hold. Mouth gaps cancel unfinished candidates and close holds; an already counted event remains disarmed through gaps until confirmed mouth closing. Eye tracking loss also interrupts candidates. Possible yawns never independently warn or play the critical alarm.

Talking, singing, deliberate opening, facial pose and occlusion can look like yawns. Displayed counts are heuristic possible-yawn events, not verified physiological yawns.

## Calibration

Calibration excludes fatigue/yawn accumulation and sound and starts an empty rolling buffer. It collects at least 3 seconds and 30 fresh valid binocular samples within a 10-second attempt; an invalid observation or >500 ms gap restarts collection within that attempt. Each eye uses a robust median baseline. Quality requires median in [0.18,0.50], median absolute deviation / median <=0.12, and (90th percentile−10th percentile) / median <=0.25. Percentiles use indexed sorted samples. Threshold = 0.70×median must fall inside configured calibration bounds, initially [0.10,0.35]. Stable but closed eyes are not guaranteed to be detected; instructions to keep eyes naturally open are essential.

Success records separate baselines and thresholds. Failure/cancel retains a prior successful calibration. Success/cancel/failure reacquires fresh observations and resets rolling/transient state. Calibration is never written to localStorage. Start after Stop creates a fresh uncalibrated session. Camera switching keeps session totals but clears calibration and rolling analysis. A new manual EAR threshold clears calibration; Reset to Defaults also clears it. Changing other analysis settings retains calibration but resets affected analysis buffers. Sound/volume/overlay preferences preserve detection history.

## State precedence and reasons

| Condition (highest priority first) | Prominent status | Effect |
| --- | --- | --- |
| Setup/inference failure | ERROR | Release camera/model; silence; actionable retry |
| Stopped / not started | Camera off (OFF) | No driver assessment; frozen session summary |
| Hidden document | Monitoring paused (PAUSED) | Camera remains open, inference/analysis/audio stop |
| Permission/model initialization | Getting ready (LOADING) | Progress shown; Stop cancels pending work |
| No face | NO_FACE | Metrics unavailable; all eye/yawn continuity interrupted |
| Invalid eye geometry | INVALID_EYES | Same eye interruption; never a zero EAR |
| Stale result / gap >500 ms | STALE | Unknown, no elapsed closure across gap |
| Fresh data not yet acquired / ambiguous initial hysteresis | ACQUIRING | Unknown until acquisition completes |
| Guided collection | CALIBRATING | Exclude statistics; tracking loss still takes prominence |
| Critical closure episode | DROWSY / PROLONGED_CLOSURE_CRITICAL | Red indication and eligible sound pattern |
| Warning closure and/or ready high rolling ratio | WARNING / PROLONGED_CLOSURE_WARNING / ROLLING_CLOSURE_HIGH | Amber, visual by default |
| Fresh eligible observations with no active rule | ALERT | Green; does not certify safety |

## Lifecycle, privacy and resource bounds

- One callback chain and one inference frame in flight. New decoded frames only, positive image dimensions, strictly increasing capture times. `requestVideoFrameCallback` preferred, animation-frame fallback checks `video.currentTime`.
- Worker target 12 attempts/s; UI publishes roughly 5–10/s. Performance is measured, not promised. A browser without Worker/OffscreenCanvas support uses main-thread inference capped at 8/s, with the mode shown. Main-thread inference blocks the UI during each call; wrapping it in a promise is not offloading.
- MediaPipe 0.10.32 uses classic `importScripts` WASM loaders. Setup/build compiles `src/vision/vision.worker.js` into a local classic IIFE worker; it is not a module worker. The newer package's metrics sender was incompatible with the no-analytics scope, so it was rejected. Development/preview servers apply a same-origin CSP and the asset/build scripts reject known telemetry signatures. The rate display waits for at least one second and five completed results to suppress startup spikes.
- A failed GPU worker is terminated before a fresh CPU worker attempt. Both failing ends initialization with an actionable error. Worker realm termination disposes superseded WASM/GPU resources and transferred images; per-frame bitmaps close after processing. Stop ends tracks/callbacks/timers, terminates vision, and silences audio.
- Generation guards reject late camera/model results; a separate epoch rejects pre-pause/configuration/calibration frame results. A 200 ms watchdog detects stalled streams; timing of the display can lag the 500 ms freshness threshold by up to one watchdog period.
- Hidden time is explicitly paused. Returning reacquires for 500 ms. Camera remains open while hidden and the UI labels it accurately on return.
- One reusable AudioContext after user interaction; two short tones at 740/980 Hz, repeated every 1.2 seconds only while critical and eligible. Silence affects the current critical audio for 10 seconds. Recovery/loss/pause clears it. Test Alarm is isolated and changes no analyzer totals.
- Chart: trailing 60 seconds, max 750 points. Visible/exported timeline: last 100 entries, separate dropped-entry count. Repeated tracking messages have a 2-second per-code debounce; validity itself is never debounced. Aggregate episode counts remain independent. Config/calibration change history is bounded to 100 and exports its truncation count.
- Session elapsed, paused, calibration, eligible and valid observed durations are separate. Camera switching clears temporal analysis but retains totals; explicit Stop/Start starts a new session. Export contains schema/app version, source=live, timestamps, effective settings/calibration/change history, statistics and events, without photos or raw landmarks.

## Limits and assumptions

Thresholds are demonstration settings supplied for this project. Frontal pose, visible eyes, adequate lighting and one person are assumed. Glasses/reflections, sunglasses, head rotation, motion blur, low frame rate, partial occlusion and a different user's baseline can cause false results. Primary-face selection is not identity tracking; a person swap without loss can inherit the current calibration. Recalibrate or Stop/Start when students swap. This application does not infer sleep stage, diagnose disease, establish fitness to drive, or replace a driver's judgment. Actual human-camera behavior remains a manual test item.
