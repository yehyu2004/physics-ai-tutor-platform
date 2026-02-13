"use client";

import { useEffect, useRef } from "react";
import type { ActivityCategory } from "./track-activity";

export function useTrackTime(category: ActivityCategory, detail?: string) {
  const activityIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    activityIdRef.current = null;

    // Create the activity record and store its ID
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, detail }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.id) activityIdRef.current = json.id;
      })
      .catch((err) => console.error("[activity] Failed to create activity:", err));

    const sendDuration = () => {
      const id = activityIdRef.current;
      if (!id) return;
      const durationMs = Date.now() - startTimeRef.current;
      if (durationMs < 1000) return; // ignore <1s visits

      // Use sendBeacon for reliable unload delivery (POST with id+durationMs)
      const payload = JSON.stringify({ id, durationMs });
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/activity", blob);
      } else {
        fetch("/api/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch((err) => console.error("[activity] Failed to send duration:", err));
      }
    };

    // Send duration on visibility hidden (covers tab switch, app switch, close)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendDuration();
      }
    };

    // Also handle beforeunload as fallback
    const handleBeforeUnload = () => {
      sendDuration();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      sendDuration();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, detail]);
}
