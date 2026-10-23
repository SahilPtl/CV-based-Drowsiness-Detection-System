import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
export async function loadLandmarker(baseUrl, delegate) {
  const files = await FilesetResolver.forVisionTasks(`${baseUrl}assets/vision`);
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: `${baseUrl}assets/face_landmarker.task`,
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}
