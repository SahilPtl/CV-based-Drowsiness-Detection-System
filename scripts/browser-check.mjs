// Isolated automated QA only: synthetic blank media does NOT test real fatigue detection.
// Uses an installed Playwright package via VIGIL_PLAYWRIGHT_PATH; no runtime simulation mode.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  process.env.VIGIL_PLAYWRIGHT_PATH
    ? pathToFileURL(process.env.VIGIL_PLAYWRIGHT_PATH).href
    : "playwright"
);
const base = process.env.VIGIL_TEST_URL || "http://localhost:4173/";
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
await mkdir("evidence", { recursive: true });
const report = {
  date: "2026-10-24",
  browser: browser.version(),
  base,
  checks: [],
  errors: [],
  console: [],
  externalRequests: [],
  modelRequests: [],
  limitations: [
    "Blank test video only; no real webcam or human fatigue validation.",
    "Headless audio validates scheduling/context state, not speaker audibility.",
  ],
};
let currentPage;
const check = (name, detail) => {
  report.checks.push({ name, result: "PASS", detail });
  console.log(`PASS ${name}: ${detail}`);
};
async function context(options = {}) {
  const c = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    ...options,
  });
  // Routing disables cache. Every context is fresh; localhost remains reachable.
  await c.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      report.externalRequests.push(url.href);
      return route.abort();
    }
    if (/face_landmarker\.task|vision_wasm.*\.(js|wasm)/.test(url.pathname))
      report.modelRequests.push(url.href);
    return route.continue();
  });
  c.on("page", (page) => {
    currentPage = page;
    page.on("pageerror", (error) => report.errors.push(error.stack));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type()))
        report.console.push(message.text());
    });
  });
  return c;
}
try {
  const c = await context(),
    page = await c.newPage();
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Stay aware. Stay present." })
    .waitFor();
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `evidence/dashboard-${width}.png`,
      fullPage: true,
    });
    if (width === 1366)
      await page.screenshot({ path: "evidence/dashboard-overview.png" });
    const sizes = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
      cameraBottom: document
        .querySelector(".camera-panel")
        .getBoundingClientRect().bottom,
      metricsBottom: document
        .querySelector(".metrics-grid")
        .getBoundingClientRect().bottom,
    }));
    assert.ok(sizes.scroll <= sizes.width, `Overflow at ${width}`);
    if (width === 1366) {
      assert.ok(sizes.cameraBottom < height);
      assert.ok(sizes.metricsBottom < height);
    }
    check(
      `Layout ${width}×${height}`,
      `No horizontal overflow; camera bottom ${Math.round(sizes.cameraBottom)}px, metrics bottom ${Math.round(sizes.metricsBottom)}px.`,
    );
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("spinbutton", {
      name: "Closure warning duration ms",
      exact: true,
    })
    .fill("3000");
  await page.getByRole("button", { name: "Apply settings" }).click();
  await page
    .getByText("Warning duration must be less than critical duration.")
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog").count(), 0);
  check(
    "Validation / keyboard dialog",
    "Incoherent durations rejected; Escape dismisses the modal.",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("spinbutton", {
      name: "Shared EAR closure threshold ratio",
      exact: true,
    })
    .fill("0.23");
  await page.getByRole("button", { name: "Apply settings" }).click();
  await page.getByText("Uncalibrated · EAR threshold 0.23").waitFor();
  await page.reload();
  await page.getByText("Uncalibrated · EAR threshold 0.23").waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Reset to Defaults" }).click();
  await page.getByText("Uncalibrated · EAR threshold 0.21").waitFor();
  check(
    "Preferences / reset",
    "Valid preference survives reload; Reset restores 0.21.",
  );
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(() => document.activeElement !== document.body),
  );
  check("Keyboard navigation", "Tab moves focus to an interactive control.");
  await c.close();

  const live = await context();
  await live.addInitScript(() => {
    if (!navigator.mediaDevices) return;
    let denied = true;
    window.__vigilTestTracks = [];
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        if (denied) {
          denied = false;
          throw new DOMException("Test camera denial", "NotAllowedError");
        }
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        let count = 0;
        const timer = setInterval(() => {
          ctx.fillStyle = `rgb(${20 + (count++ % 10)},30,40)`;
          ctx.fillRect(0, 0, 640, 480);
        }, 66);
        const stream = canvas.captureStream(15);
        window.__vigilTestTracks.push(...stream.getTracks());
        stream
          .getTracks()[0]
          .addEventListener("ended", () => clearInterval(timer));
        return stream;
      },
    });
  });
  const test = await live.newPage();
  await test.goto(base);
  await test.reload();
  await test
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await test.getByRole("heading", { name: "Setup needs attention" }).waitFor();
  assert.ok(
    (await test.locator(".status-description").innerText()).includes(
      "permission denied",
    ),
  );
  check("Camera denial", "Actionable denial status; retry is user initiated.");
  await test.screenshot({ path: "evidence/camera-denial.png", fullPage: true });
  await test
    .getByRole("button", { name: "Start · retry", exact: true })
    .click();
  await test.waitForFunction(
    () =>
      ["No face in view", "Setup needs attention"].includes(
        document.querySelector(".assessment-status h2")?.textContent,
      ),
    null,
    { timeout: 90000 },
  );
  assert.equal(
    await test.locator(".assessment-status h2").innerText(),
    "No face in view",
    await test.locator(".status-description").innerText(),
  );
  const mode = await test.locator(".camera-caption").innerText();
  check(
    "Real model + WASM initialization / inference",
    `${mode}; blank synthetic video correctly reports NO FACE.`,
  );
  await test.waitForFunction(() =>
    /[\d.]+ updates\/s/.test(
      document.querySelector(".chart-foot")?.textContent,
    ),
  );
  check(
    "Measured blank-video performance",
    await test.locator(".chart-foot").innerText(),
  );
  await test.screenshot({
    path: "evidence/model-initialized-blank-test-video.png",
    fullPage: true,
  });
  assert.ok(
    report.modelRequests.some((url) => url.endsWith("face_landmarker.task")),
  );
  assert.ok(report.modelRequests.some((url) => url.endsWith(".wasm")));
  assert.equal(report.externalRequests.length, 0);
  check(
    "Fresh context / external network blocked",
    "Real production model loaded from localhost with empty cache, external routing blocked, and zero external requests.",
  );
  await test.getByRole("button", { name: "Test Alarm" }).click();
  await test.getByRole("button", { name: "Stop session", exact: true }).click();
  assert.ok(
    await test.evaluate(() =>
      window.__vigilTestTracks.every((t) => t.readyState === "ended"),
    ),
  );
  const exportPromise = test.waitForEvent("download");
  await test.getByRole("button", { name: "Export JSON" }).click();
  const download = await exportPromise;
  await download.saveAs("evidence/test-session-export.json");
  check(
    "Stop / export",
    "Test stream tracks stopped; session JSON downloaded.",
  );
  await test
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await test
    .getByRole("heading", { name: "No face in view" })
    .waitFor({ timeout: 90000 });
  await test.getByRole("button", { name: "Stop session", exact: true }).click();
  assert.ok(
    await test.evaluate(() =>
      window.__vigilTestTracks.every((t) => t.readyState === "ended"),
    ),
  );
  check(
    "Repeated Start / Stop",
    "Second real model initialization and clean track shutdown.",
  );
  let modelAttempts = 0;
  const failFirst = (route) => {
    modelAttempts++;
    return modelAttempts === 1 ? route.abort() : route.fallback();
  };
  await live.route("**/assets/face_landmarker.task", failFirst);
  await test
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await test
    .getByRole("heading", { name: "No face in view" })
    .waitFor({ timeout: 90000 });
  assert.ok(
    (await test.locator(".camera-caption").innerText()).includes(
      "Worker · CPU",
    ),
  );
  check(
    "CPU fallback",
    "Blocked first model request deliberately; failed GPU worker was replaced by a real CPU worker and inference succeeded.",
  );
  await test.getByRole("button", { name: "Stop session", exact: true }).click();
  await live.unroute("**/assets/face_landmarker.task", failFirst);
  const failAll = (route) => route.abort();
  await live.route("**/assets/face_landmarker.task", failAll);
  await test
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await test
    .getByRole("heading", { name: "Setup needs attention" })
    .waitFor({ timeout: 90000 });
  assert.ok(
    (await test.locator(".status-description").innerText()).includes(
      "npm run setup:assets",
    ),
  );
  assert.ok(
    await test.evaluate(() =>
      window.__vigilTestTracks.every((t) => t.readyState === "ended"),
    ),
  );
  await live.unroute("**/assets/face_landmarker.task", failAll);
  await test
    .getByRole("button", { name: "Start · retry", exact: true })
    .click();
  await test
    .getByRole("heading", { name: "No face in view" })
    .waitFor({ timeout: 90000 });
  await test.getByRole("button", { name: "Stop session", exact: true }).click();
  check(
    "Missing assets / user retry",
    "Both initialization attempts fail clearly and release tracks; restoring assets and clicking Start recovers.",
  );
  await live.close();
  assert.deepEqual(report.errors, []);
  check("Uncaught browser errors", "Zero pageerror events.");
} catch (error) {
  report.failure = error.stack;
  if (currentPage && !currentPage.isClosed()) {
    report.lastState = await currentPage.locator("body").innerText();
    await currentPage.screenshot({
      path: "evidence/browser-failure.png",
      fullPage: true,
    });
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(
    "evidence/browser-results.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
