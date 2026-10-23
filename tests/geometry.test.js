import { describe, expect, it } from "vitest";
import {
  geometry,
  eyeRatio,
  toPixels,
  LEFT_EYE,
  RIGHT_EYE,
} from "../src/analysis/geometry.js";
function fixture(width, height) {
  const points = [];
  for (const [indices, x] of [
    [LEFT_EYE, 300],
    [RIGHT_EYE, 160],
  ]) {
    const eye = [
      [0, 0],
      [10, -6],
      [30, -6],
      [40, 0],
      [30, 6],
      [10, 6],
    ];
    indices.forEach((index, i) => {
      points[index] = {
        x: (x + eye[i][0]) / width,
        y: (100 + eye[i][1]) / height,
      };
    });
  }
  for (const [index, x, y] of [
    [13, 250, 210],
    [14, 250, 240],
    [61, 220, 225],
    [291, 280, 225],
  ])
    points[index] = { x: x / width, y: y / height };
  return points;
}
describe("pixel geometry", () => {
  it.each([
    [640, 640],
    [640, 480],
    [640, 360],
  ])("preserves EAR/MAR at %ix%i for the same pixel geometry", (w, h) => {
    const result = geometry(fixture(w, h), w, h);
    expect(result.leftEAR).toBeCloseTo(0.3, 10);
    expect(result.rightEAR).toBeCloseTo(0.3, 10);
    expect(result.mar).toBeCloseTo(0.5, 10);
  });
  it("rejects missing, nonfinite, zero width and invalid dimensions", () => {
    expect(eyeRatio(Array(6).fill({ x: 0, y: 0 }))).toBeNull();
    expect(eyeRatio(Array(6).fill({ x: NaN, y: 1 }))).toBeNull();
    expect(toPixels({ x: Infinity, y: 0 }, 640, 480)).toBeNull();
    expect(toPixels({ x: 0.5, y: 0.5 }, 0, 480)).toBeNull();
    expect(geometry([], 640, 480).faceValid).toBe(false);
  });
  it("keeps legitimate zero eye opening and separates mouth validity", () => {
    const points = fixture(640, 480);
    for (const i of LEFT_EYE) points[i].y = 0.2;
    points[13] = null;
    expect(geometry(points, 640, 480)).toMatchObject({
      leftEAR: 0,
      mouthValid: false,
      mar: null,
    });
  });
});
