# VIGIL demonstration — four students, 3–5 minutes

**Present this as an experimental educational prototype, not a road safety or medical system.** Demonstrate seated at a desk. Submission target: 31 October 2026.

## Before the demonstration

- Run `npm ci` and `npm run setup:assets` with internet access beforehand. Run lint, tests and production build. Keep local assets intact.
- Rehearse `npm run dev` in Ubuntu and open Windows **http://localhost:5173/**. For a production/offline rehearsal, `npm run preview` uses **http://localhost:4173/** after building.
- Use even light from the front, a stable camera at eye level, and one person in view. Avoid backlighting and glasses glare.
- Grant webcam permission, choose the correct device, verify the preview and landmark alignment. Click **Test Alarm** and check actual speaker volume. Automated tests cannot certify what your laptop sounds like.
- Start a new session for the demonstrator. Calibrate with eyes naturally open; show the resulting left/right baselines and thresholds. Retry if quality is insufficient.
- For an offline demo, block external connections but keep localhost reachable, reload without a warm cache, and verify real webcam/model/audio. The automated offline test used real inference on blank synthetic video, so this physical rehearsal is still required.
- Keep README, ALGORITHM and TESTING open in VS Code. Have a second student ready to explain any tracking limitation rather than claiming success when the screen says UNKNOWN/NO FACE.

## Suggested sequence

| Time | Presenter | Demonstration / explanation |
| --- | --- | --- |
| 0:00–0:40 | Student 1 — architecture | Introduce VIGIL and local privacy. Show camera off, then Start. Explain Windows browser owns the webcam; Ubuntu serves static files. No backend or uploaded frames. |
| 0:40–1:25 | Student 2 — geometry | Point to subject-left/right EAR, their average, MAR, and overlays. Explain aspect-ratio correction. Run or describe the real calibration workflow and show separate thresholds. |
| 1:25–2:35 | Student 3 — temporal analysis | Show normal blinking without warning. After tracking acquires, deliberately close eyes long enough for warning then critical. Open them and show confirmed recovery. Explain 1000/2500/800 ms are classifier-time heuristics; smoothing/sampling add visible delay. |
| 2:35–3:20 | Student 3 + 4 | Sustain mouth opening to produce one possible yawn; hold it to show no repeat, then close to rearm. Explain speech false positives. Briefly leave the frame: metrics become unavailable and alarms stop. Return and show reacquisition. |
| 3:20–4:20 | Student 4 — robustness/evidence | Show sound/volume, Test Alarm, temporary silence if critical, settings validation, timeline and session export. Explain provisional rolling closure needs 20s valid and 70% coverage; it may be ready by now. |
| 4:20–5:00 | All | Stop, show frozen summary and JSON. State limits, distinguish deterministic tests from live-camera evaluation, and identify each student's module responsibility. |

For a three-minute slot, prepare calibration before speaking, combine yawns with the timeline explanation, and keep the rolling explanation to one sentence. Do not invent a prerecorded result if tracking fails.

## Division of ownership

1. **Browser and architecture:** `src/browser/controller.js`, `src/vision/`, cancellation, worker/CPU fallback, local assets, camera permissions.
2. **Image processing:** `src/analysis/geometry.js`, pixel normalization, landmark indices, EAR/MAR, preview/overlay mapping.
3. **Temporal reasoning:** analyzer, closure/recovery, missing-data rules, yawn rearming, rolling time windows and calibration.
4. **Interface and verification:** React components, settings, Web Audio, session/event export, automated evidence and limitations.

Everyone should be able to trace a single frame from camera capture through the worker, geometry, analyzer result and dashboard. This is a suggested explanation split, not a claim about who authored the code.

## Viva questions

**Where is AI used?** Google's pretrained Face Landmarker estimates facial landmarks. We did not train it. EAR/MAR and fatigue decisions are explicit geometry/time heuristics, not a trained fatigue classifier.

**Why not count frames?** Frame rate and inference latency change across laptops. Monotonic timestamps measure observed elapsed time. Gaps over 500 ms are unknown and cannot become sustained closure.

**Why scale coordinates?** Normalized x and y have different pixel scales in a rectangular frame. Multiplying by the actual inference width/height makes Euclidean distances isotropic.

**What is EAR?** Two vertical eye distances divided by twice the corner-to-corner width. It is computed separately for each eye using six MediaPipe indices.

**What is MAR here?** Inner-lip center separation (13–14) divided by mouth width (61–291). It is a project-specific normalized opening ratio.

**Why calibration?** Eye shapes and camera conditions vary. We take separate stable median open-eye baselines and use 70% of each as a starting closure threshold. The procedure cannot prove eyes were actually open.

**How is missing data handled?** It immediately invalidates displayed live measurements and continuity. It is never treated as an alert driver or zero EAR. The analyzer reacquires fresh data before resuming.

**Is this standard PERCLOS?** It is PERCLOS-style time-weighted closure based on our EAR rule, including blinks. It does not establish a clinical eyelid-occlusion definition. Low valid coverage disables its warning contribution.

**What does 25% mean?** If 15 seconds of a fully valid 60-second window are classified binocularly closed, the ratio is 25%. The denominator is valid observed time; coverage separately reveals how much eligible time was seen.

**Why do warnings stay briefly after opening?** The closure timer breaks immediately, but the indication needs 800 ms continuously confirmed binocular opening to recover. A separate rolling warning can remain active.

**Does a yawn cause the alarm?** No. Sustained mouth opening is only supporting context; talking and deliberate opening may look similar. DROWSY requires the critical eye-closure episode.

**How does the worker help?** `detectForVideo` is synchronous. A real worker isolates it from the UI and holds at most one frame in flight. A promise alone would not offload it.

**Why pin an older MediaPipe package?** The newer inspected package contained usage-metrics reporting. Version 0.10.32 was selected and checked to meet the no-analytics scope. Its classic loader is bundled into a compatible classic worker.

**What is the accuracy?** No real-world accuracy has been measured. Unit/integration tests verify specified behavior and lifecycle handling; blank-video browser checks verify real model loading and inference, not human-fatigue sensitivity or specificity.

**What fails?** Glasses glare, poor lighting, pose, occlusion, speech, camera stalls and switching people can cause unavailable or misleading observations. This is not suitable for real driving decisions.
