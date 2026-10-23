# Verification and acceptance evidence

Implementation and checks completed across 23–24 October 2026 (Asia/Kolkata). No real-world accuracy, sensitivity, specificity, dataset evaluation, or human-camera demonstration is claimed.

## Actual environment

- Empty selected Git workspace, no application or applicable parent AGENTS.md found. Work remained in the selected project root.
- Host: Windows PowerShell. WSL: Ubuntu-22.04. Linux Node **22.12.0**, npm **11.1.0**, from nvm. No Windows `node_modules` were installed.
- Windows system Node **20.16.0** / npm **10.9.2** were inspected, but incompatible system Node was not used to build.
- Isolated browser runner: bundled Windows Node **24.19.0** and bundled Playwright; Windows Edge **155.0.4283.62** headless. This is separate from Linux application dependencies.
- Final MediaPipe package: **0.10.32**, model **float16/1**. The newer inspected package was rejected due to its metrics reporting code.

## Commands actually executed

PowerShell launched each Linux npm command with this wrapper, from the selected workspace:

```powershell
wsl -d Ubuntu-22.04 -- bash -lc 'source ~/.nvm/nvm.sh; npm install'
wsl -d Ubuntu-22.04 -- bash -lc 'source ~/.nvm/nvm.sh; npm install --save-exact @mediapipe/tasks-vision@0.10.32'
wsl -d Ubuntu-22.04 -- bash -lc 'source ~/.nvm/nvm.sh; npm ci'
wsl -d Ubuntu-22.04 -- bash -lc 'source ~/.nvm/nvm.sh; npm run setup:assets'
wsl -d Ubuntu-22.04 -- bash -lc 'source ~/.nvm/nvm.sh; npm run lint'
wsl -d Ubuntu-22.04 -- bash -lc 'source ~/.nvm/nvm.sh; npm test -- --run'
wsl -d Ubuntu-22.04 -- bash -lc 'source ~/.nvm/nvm.sh; npm run build'
wsl -d Ubuntu-22.04 -- bash -lc 'source ~/.nvm/nvm.sh; npm run dev'
wsl -d Ubuntu-22.04 -- bash -lc 'source ~/.nvm/nvm.sh; npm run preview'
```

Some checks were rerun after fixes; the entries below describe the final version. Setup and build were also executed together once with `npm run setup:assets && npm run build` in the same WSL wrapper.

Source was formatted with `npm exec --yes --package=prettier@3.9.10 -- prettier --write src tests scripts vite.config.js eslint.config.js` inside that WSL environment. Formatting completed successfully; the final sequence `npm run lint && npm test -- --run && npm run build` was then run in the same wrapper. Browser evidence precedes this formatting-only pass and reflects the same behavior.

| Command/check | Actual outcome |
| --- | --- |
| `npm install` | Success; initial lockfile created |
| `npm install --save-exact @mediapipe/tasks-vision@0.10.32` | Success; privacy-compatible release pinned, lockfile updated |
| `npm ci` | Success on final lockfile; 168 packages added, audit reported 0 vulnerabilities at execution |
| `npm run setup:assets` | Success; pinned 3,758,596-byte model, four matching WASM files, classic worker |
| `npm run lint` | Pass, no lint findings |
| `npm test -- --run` | **50 tests passed across 3 files** |
| `npm run build` | Pass; main bundle, worker, model, matching WASM and licenses in `dist`; checksums and telemetry-signature checks passed |
| `npm run dev` | WSL server started at port 5173; Windows HTTP request returned 200; in-app browser inspected |
| `npm run preview` | Production server started at port 4173; Windows HTTP request returned 200; browser QA used production output |
| Header check | Same-origin CSP present on production preview response |
| Browser QA command below | **15 acceptance checks passed**, zero uncaught page errors, zero external requests |

Owned development/preview servers and the temporary browser tab were stopped after verification. Start the server using SETUP_WSL.md; no background VIGIL camera session is left running.

ESLint 9.39.1 emitted an upstream maintenance/deprecation notice during install. It was retained for compatibility with the existing Node installation; lint itself passed. The package audit result is an observation at execution time, not a permanent security guarantee.

Exact isolated browser command, run in Windows PowerShell at the project root:

```powershell
$env:VIGIL_PLAYWRIGHT_PATH = 'C:\Users\sahil\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs'
& 'C:\Users\sahil\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/browser-check.mjs
```

The browser runner is optional development QA and not required to use VIGIL. On another machine, provide an installed Playwright package path (and Edge), or adapt the test runner's browser channel. No extra browser testing dependency was added to the application's lockfile.

## Automated coverage

`tests/geometry.test.js` — 5 tests: known EAR/MAR, square/4:3/16:9 conversion, degenerate/nonfinite coordinates, legitimate closed-eye EAR zero, and independent mouth validity.

`tests/analyzer.test.js` — 35 tests: exact inclusive thresholds/hysteresis, short blink, closure/recovery durations, escalation/count deduplication, repeated closures, 50/100/200 ms sampling and jitter, EMA numeric expectation, duplicate/out-of-order/invalid receive times, 10-second gap, face/eye/stale loss, acquisition, pause/resume/session isolation, yawn hold/rearm/gaps, rolling 25% sanity check, clipping/no extrapolation/zero denominators/readiness loss/hysteresis/competing reasons, robust calibration and old-calibration retention, configuration/reset/storage and bounded export.

`tests/browser-lifecycle.test.js` — 10 tests with mocked browser APIs: late getUserMedia/model promises, repeated Start/Stop, one frame in flight, no duplicate loops, track/model cleanup, hidden-tab result invalidation, camera switching with retained totals, permission/disconnect/inference errors, single alarm loop, disable/silence/10-second resume, isolated sound check, blocked audio and late audio unlock cancellation.

Tests assert public numeric/state outcomes, not merely mirrored implementation code. Browser mocks are integration evidence only. No synthetic values appear in the ordinary monitoring UI.

## Production browser checks and screenshots

Final machine-readable output: [evidence/browser-results.json](evidence/browser-results.json). It records actual requested model/WASM URLs, browser version, warnings and results. The browser script uses a **blank synthetic canvas stream**, with real MediaPipe inference. The screenshots of that stream are explicitly named as test video; they are not webcam results.

| Check | Result/evidence |
| --- | --- |
| 1366×768 | No horizontal overflow; camera ends at y=562, primary metrics at y=694, both within viewport |
| 1920×1080 | No horizontal overflow; camera y=756, metrics y=917 |
| 390×844 | No horizontal overflow; stacked secondary/primary content scrolls naturally |
| Settings/keyboard | Invalid warning>=critical rejected, Escape dismisses, Tab moves focus |
| Preferences | Shared EAR change survives reload; Reset to Defaults restores 0.21 |
| Camera denial/retry | Injected NotAllowedError gives actionable guidance and user-initiated retry |
| Actual model initialization | Real pinned model + WASM loads in Worker/GPU; blank video correctly yields NO FACE |
| Fresh offline reload | New context, cache disabled by routing, external requests blocked, localhost reachable; zero external requests |
| Performance display | Final blank-video observation read **5 ms inference / 9.8 updates/s**. This is not a human-face benchmark or guaranteed rate. |
| Start/Stop/export | All synthetic tracks end; real JSON download; second model load and clean shutdown |
| CPU fallback | First model request deliberately blocked, new CPU worker initializes actual model and runs inference |
| Missing assets | Both attempts fail visibly; tracks release; restoring assets and clicking Start recovers |
| Console | Zero uncaught pageerror events. MediaPipe diagnostic warnings and Edge download-UI preload warnings are recorded, not misrepresented as zero console output. |

Screenshots: `dashboard-overview.png`, `dashboard-1366.png`, `dashboard-1920.png`, `dashboard-390.png`, `camera-denial.png`, `model-initialized-blank-test-video.png`. Visual inspection checked spacing, camera/status prominence and narrow-screen overflow. `test-session-export.json` is a test-only artifact from the blank media session.

The in-app browser was also inspected interactively: initial screen, invalid settings, Escape, Start pending permission, then Stop. Its permission flow did not produce an accessible webcam stream. It was cancelled without repeatedly prompting. This is the exact reason the physical-camera path remains unverified.

## Faults discovered and fixed

1. Real browser inference initially failed with an illegal invocation because `createImageBitmap` was passed as an unbound browser method. It now runs through an arrow wrapper. The full browser checks passed afterward.
2. Initial short completion intervals briefly inflated the rate display. It now waits for a one-second/five-result window before reporting update rate.
3. MediaPipe 1.1.1 contained metrics-reporting code, contrary to scope. It was replaced with 0.10.32, audited, and tested again with locally rebuilt assets. No new-version runtime path remains.
4. The first classic-worker bundling attempt used a public output directory without disabling Vite's public copy. It was stopped, `publicDir: false` was set for that separate build, and only the verified generated tree was cleaned using `node scripts/clean-failed-worker-build.mjs`. Setup/build then passed. No unrelated workspace files were removed.
5. Lifecycle review added rejection of captures crossing pause/configuration boundaries, frozen rolling results after Stop, and initial setup error events. Regression tests cover these cases.

An earlier failed screenshot may remain as `browser-failure.png`; it is historical diagnostic evidence, not the final UI state. The final report JSON is authoritative for the final run.

## Acceptance matrix

| Required area | Implemented | Verification/result or precise gap |
| --- | --- | --- |
| React/Vite/JS/Lucide modular app | Yes | Linux install, lint and production build pass |
| Local pretrained model; accurate ML/heuristics distinction | Yes | Real GPU and CPU inference; README/ALGORITHM/How Detection Works |
| Pixel geometry, per-eye EAR/MAR and validity | Yes | Numeric/aspect-ratio tests pass; physical landmarks/pose still manual |
| Closure hysteresis, warning, critical, recovery/counts | Yes | Exact deterministic timing and jitter tests pass; physical timings include smoothing/sample latency |
| Unknown/acquisition/stale/pause lifecycle | Yes | Analyzer/controller tests; hidden-tab physical camera behavior remains manual |
| Possible yawns/rearm | Yes | Deterministic tests; real-mouth sensitivity/false positives unverified |
| Rolling time weighting, coverage/readiness and warning reasons | Yes | Numeric 25%, clipping, readiness/hysteresis/competing reason tests pass |
| Guided calibration/cancel/retry/per-eye thresholds | Yes | Robust sample and lifecycle tests; real open-eye sample quality manual |
| Settings validation/persistence/reset | Yes | Unit and production browser tests pass |
| Camera permission/errors/switching/cleanup | Yes | Denial browser test, mock races/disconnect/switch tests; multiple physical cameras unverified |
| Local model/WASM setup + checksums/licenses | Yes | Setup/build checks pass; package privacy selection documented |
| Worker, one frame, CPU fallback/performance | Yes | Real GPU/CPU browser paths and bounded-frame tests; main-thread fallback and non-SIMD hardware unexercised |
| Responsive dashboard, chart gaps, real overlays | Yes | Three viewport screenshots and geometry code; physical overlay alignment/mirroring remains manual |
| Audio enable/volume/test/silence/cleanup | Yes | Mock audio lifecycle + browser user gesture; actual speaker audibility unverified |
| Session denominators/events/export | Yes | Unit tests + actual browser JSON download; independent counts and truncation flags |
| Offline initialization without warm cache | Yes | Production reload with external routing blocked, real inference on blank test stream; physical camera offline rehearsal still manual |
| Documentation and four-student handoff | Yes | README, SETUP_WSL, ALGORITHM, TESTING, DEMO_GUIDE, ASSETS complete |
| Real-world fatigue performance | Not claimed | No evaluated dataset, accuracy percentage, clinical or driving validation |

## Real-laptop checks requiring a person

Perform seated at a desk, with a new session and successful calibration. Allow for 100 ms EMA smoothing and roughly 83–133 ms frame spacing; visible transitions are not millisecond-perfect physiological measurements. A 500 ms reacquisition interval precedes assessment.

| Action | Expected behavior |
| --- | --- |
| Start with camera/audio permissions | Real preview, model mode, fresh acquisition, then measured EAR/MAR |
| Natural blinking / short ~200 ms closure | No warning; brief closure can enter the rolling ratio |
| Sustained closure for >1 second after classification | WARNING once, warning count +1 |
| Continue to >2.5 seconds | DROWSY once, critical count +1, repeating audible tones |
| Open eyes and keep both open | Closure duration immediately breaks; indication recovers after ~800 ms confirmed opening plus classifier delay |
| Brief open then close again before recovery | Current duration restarts; separate closures are not added |
| Test Alarm / volume / sound off | Short isolated sound check; volume works; disable stops current alert; no fatigue counts change |
| Silence 10s while critical | Red severity stays; audio resumes if the same critical condition persists after 10s |
| Sustain mouth opening >1.5s | One possible yawn; no independent critical alarm |
| Hold open, close >=500ms, open again | No repeat during hold; closing rearms a new possible yawn |
| Brief talking/mouth movement | Usually no event under duration rule; false positives remain possible |
| Leave frame/cover eyes/disconnect | Metrics unavailable and alarm stops immediately on invalid observation; no false confirmed ALERT |
| Return after a long tracking gap | Reacquisition; closure/rolling intervals do not bridge unknown time |
| Switch tab, wait, return | PAUSED while hidden; stream remains open; no alarm; reacquires on return; paused time excluded |
| Deny camera then fix browser permission | Clear guidance; Start retries only on user action |
| Repeat rapid Start/Stop and Stop during permission/model load | No ghost preview, duplicate sound or stale callbacks; camera indicator releases |
| Change physical camera | Previous tracks stop; calibration/rolling reset; session aggregate counts retained |
| Calibrate with stable naturally open eyes | >=3s/30 samples, separate baseline/threshold result, excluded from fatigue statistics |
| Calibrate with motion/insufficient samples; cancel | Fail/cancel safely, retain previous calibration; retry available |
| Resize and mirror preview | Eye/mouth outlines stay aligned without double mirroring or stretching |
| Run at least 20s with >=70% valid coverage | Rolling ratio changes from provisional to ready; never a probability of fatigue |
| Change analysis vs sound/overlay settings | Analysis resets transient buffers; presentation preferences preserve history |
| Stop/export | Frozen totals; JSON includes config/timing/counts/events, no pictures/landmarks |
| Fresh cache-empty reload with external access blocked | Model initializes from localhost; real webcam and audible alarm still work |

Unverified: actual human-eye/mouth detection, visual overlay fit on a live face, laptop speaker volume, real camera disconnect/multiple-device permission behavior, real hidden-tab hardware behavior, browser without OffscreenCanvas, non-SIMD CPU hardware, interrupted asset-download/filesystem failure injection, VS Code WSL integration launch, and physical offline rehearsal. These gaps do not replace the implemented camera path with simulation.
