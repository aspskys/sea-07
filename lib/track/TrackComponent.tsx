"use client";

import { useEffect, useState } from "react";
import { initStarunionTracker } from "./index";

interface TrackComponentProps {
  starunionConfig?: Record<string, unknown>;
}

/** Conan / StarUnion client init only — no UI. */
export function TrackComponent(props: TrackComponentProps) {
  const [, setIsTrackReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      if (!props.starunionConfig) return;
      try {
        await initStarunionTracker({
          starunionConfig: props.starunionConfig,
          appPlat: "auto",
        });
        if (!cancelled) setIsTrackReady(true);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[Track] StarUnion init skipped.", error);
        }
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
    // Init once per mount with the server-injected config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
