// Subject's anatomical left/right. Inference input is NEVER mirrored.
// P1 corner, P2/P3 upper contour, P4 opposite corner, P5/P6 lower contour.
export const LEFT_EYE = [362, 385, 387, 263, 373, 380];
export const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
export const MOUTH_OUTLINE = [
  61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91,
];
export function toPixels(point, width, height) {
  if (
    !point ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    point.x < -0.1 ||
    point.x > 1.1 ||
    point.y < -0.1 ||
    point.y > 1.1
  )
    return null;
  return { x: point.x * width, y: point.y * height };
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function eyeRatio(points) {
  if (
    points.length !== 6 ||
    points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return null;
  const width = distance(points[0], points[3]);
  if (width < 2) return null;
  const ratio =
    (distance(points[1], points[5]) + distance(points[2], points[4])) /
    (2 * width);
  // Zero opening is legitimate; only implausibly large geometry is rejected.
  return ratio >= 0 && ratio <= 0.8 ? ratio : null;
}
export function geometry(landmarks, width, height) {
  if (!landmarks?.length)
    return {
      faceValid: false,
      leftEAR: null,
      rightEAR: null,
      mar: null,
      mouthValid: false,
      reason: "NO_FACE",
    };
  const p = (index) => toPixels(landmarks[index], width, height);
  const leftEAR = eyeRatio(LEFT_EYE.map(p));
  const rightEAR = eyeRatio(RIGHT_EYE.map(p));
  const mouth = [13, 14, 61, 291].map(p);
  let mar = null;
  if (mouth.every(Boolean) && distance(mouth[2], mouth[3]) >= 3) {
    const candidate =
      distance(mouth[0], mouth[1]) / distance(mouth[2], mouth[3]);
    if (candidate >= 0 && candidate <= 1.5) mar = candidate;
  }
  return {
    faceValid: true,
    leftEAR,
    rightEAR,
    mar,
    mouthValid: mar !== null,
    reason: leftEAR === null || rightEAR === null ? "INVALID_EYES" : null,
  };
}
