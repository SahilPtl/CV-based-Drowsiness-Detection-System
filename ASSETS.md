# Assets, versions and attribution

## Installed assets

| Asset | Version/source | Local location |
| --- | --- | --- |
| MediaPipe Tasks Vision JavaScript | npm `@mediapipe/tasks-vision@0.10.32` | Bundled into the app and classic worker |
| SIMD WASM loader + binary | Same installed package, unchanged | `public/assets/vision/vision_wasm_internal.{js,wasm}` |
| non-SIMD WASM loader + binary | Same installed package, unchanged | `public/assets/vision/vision_wasm_nosimd_internal.{js,wasm}` |
| Face Landmarker task model | Google's versioned `float16/1` | `public/assets/face_landmarker.task` |
| VIGIL worker | Built from local source plus pinned vendor code | `public/assets/worker/vision.worker.js` |
| Lucide React icons | npm 1.61.0 | Bundled SVG components |
| Fonts | Segoe UI / Inter if installed / Arial / system sans-serif | System fonts only, no downloads |
| Favicon | Original small VIGIL vector mark | `public/favicon.svg` |

The official model source is [Google's Face Landmarker float16 version 1](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task), also linked in the [official Tasks Vision README](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md). No `latest` model URL is used.

Model bytes: **3,758,596**. SHA-256:

```text
64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff
```

`public/assets/manifest.json` records the installed package version and exact size/SHA-256 of every copied WASM file. The model checksum is also pinned in the setup script, including first-time downloads. Build verification hashes the production copies against this manifest and checks the worker exists and contains the real inference entry point.

## Setup and reproducibility

```bash
npm ci
npm run setup:assets
npm run build
```

Setup copies all four `.js`/`.wasm` variants from the installed package, downloads the model only when a valid pinned copy is absent, and builds the classic worker. Downloads have a timeout, HTTP status/shape/checksum checks and temporary-file-then-rename writes. A failed or mismatched download never replaces an existing model. Existing valid model copies support offline setup. Obsolete generated WASM variants are removed only after the new copies are written. The manifest is written atomically. Package dependencies and the lockfile are exact-pinned.

Binary/generated assets are present in this workspace but gitignored. After cloning source elsewhere, run setup before starting the app. The manifest and notices are tracked. `npm run build` also rebuilds the worker, then Vite copies public assets into `dist/`. After changing worker code during development, rerun setup/build and reload; the generated classic worker is not hot-reloaded from source.

The classic worker is intentional: 0.10.32 loads its WASM with `importScripts`. The newer 1.1.1 package was evaluated, then rejected after its installed README and bundle revealed usage-metrics reporting. This project uses the stable earlier release and rejects unexpected versions/known telemetry sender signatures during setup/build. Vite dev/preview serves a same-origin CSP, including worker responses. No external model URL or telemetry request is needed at runtime.

## Licenses and attribution

- MediaPipe source/runtime: Apache-2.0, Copyright The MediaPipe Authors. [Upstream license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).
- The pretrained face model is Google's work, not trained by this project. Its [official FaceMesh V2 model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf) identifies the authors and Apache License 2.0. Preserve model attribution when redistributing the bundle.
- React/react-dom: MIT. Lucide React: ISC with upstream notices in its license file.
- Local redistribution notices and license text are in `public/licenses/`, copied to production output. Build/test dependency licenses remain in their npm package metadata/files.

## Offline verification scope

The automated Windows Edge test opens the production preview in a fresh isolated context, disables cache via request routing, blocks all non-localhost requests, reloads, initializes the actual model/WASM, and runs actual inference on blank synthetic video. GPU initialization, CPU fallback after an injected first-attempt failure, missing-asset failure/retry, and repeat Stop/Start are exercised. The final evidence is `evidence/browser-results.json`.

This verifies local runtime assets and model execution, not physical webcam behavior or human detection accuracy. Rehearse a fresh offline reload with the Windows webcam and actual speakers before the demonstration. A local server is still required; there is no service worker/PWA cache.
