import dynamic from "next/dynamic";

const TrackComponent = dynamic(
  () => import("./TrackComponent").then((m) => m.TrackComponent),
  { ssr: false },
);

function parseStarunionConfig(
  raw: string | undefined,
): Record<string, unknown> | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Track] CLIENT_STARUNION_CONFIG is not valid JSON.");
    }
  }
  return undefined;
}

/** Server component: read env, inject SDK script host, mount client tracker. */
export function TrackBootstrap() {
  const starunionConfig = parseStarunionConfig(
    process.env.CLIENT_STARUNION_CONFIG,
  );
  const sdkSrc = process.env.CLIENT_STARUNION_SDK_SRC;

  return (
    <>
      {sdkSrc ? (
        // track-sdk.global.js must load before StarunionTracker waits on StarTrack
        // eslint-disable-next-line @next/next/no-sync-scripts
        <script src={sdkSrc} async />
      ) : null}
      {starunionConfig ? (
        <TrackComponent starunionConfig={starunionConfig} />
      ) : null}
    </>
  );
}
