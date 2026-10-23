import { useEffect, useRef, useState } from "react";
import { Analyzer } from "../analysis/analyzer.js";
import {
  DEFAULTS,
  loadPreferences,
  savePreferences,
} from "../analysis/config.js";
import { MonitorController } from "../browser/controller.js";
function preferences() {
  try {
    return loadPreferences(window.localStorage);
  } catch {
    return { ...DEFAULTS };
  }
}
export function useMonitor(videoRef) {
  const initial = useRef(null);
  if (!initial.current) initial.current = preferences();
  const controller = useRef(null);
  const [state, setState] = useState(() => ({
    ...new Analyzer(initial.current).snapshot(0),
    config: initial.current,
    history: [],
    devices: [],
    cameraOpen: false,
    hasSession: false,
    silenceRemainingMs: 0,
  }));
  useEffect(() => {
    const instance = new MonitorController({
      config: initial.current,
      video: videoRef.current,
      onUpdate: setState,
    });
    controller.current = instance;
    instance.publish();
    return () => {
      instance.dispose();
      controller.current = null;
    };
  }, [videoRef]);
  function configure(config) {
    const result = controller.current.configure(config);
    if (result.valid) {
      try {
        savePreferences(window.localStorage, result.config);
      } catch {
        /* Preferences remain usable for this tab. */
      }
    }
    return result;
  }
  function resetDefaults() {
    controller.current.resetDefaults();
    try {
      savePreferences(window.localStorage, DEFAULTS);
    } catch {
      /* Optional persistence. */
    }
  }
  return { state, controller, configure, resetDefaults };
}
