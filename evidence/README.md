# Evidence scope

These are actual screenshots and machine-readable results from the local application, not design mockups or evaluation results.

- `dashboard-*.png`: real initial interface at the named viewport size. Values are unavailable until observations exist.
- `camera-denial.png`: browser test injects a denied permission response.
- `model-initialized-blank-test-video.png`: actual pretrained-model inference on a **blank synthetic test stream**. It correctly reports NO FACE. This is not a physical webcam screenshot.
- `browser-results.json`: final automated checks, browser version, console diagnostics and asset requests.
- `test-session-export.json`: actual download produced during the synthetic-stream integration test. Its application source field is `live` because it exercises the ordinary camera path; the media source was injected by the test runner. It is not human measurement data and must not be used as evaluation evidence.
- `browser-failure.png`, if present: earlier diagnostic screenshot retained for honesty; see TESTING.md for the fix.

No personal camera images, raw landmarks, fabricated accuracy statistics, or trained-model evaluation dataset are included.
