import { Conan } from "@seaart/conan-core";
import { ConanPluginAd } from "@seaart/conan-plugin-ad";
import { ConanPluginApp } from "@seaart/conan-plugin-app";
import { ConanPluginMap } from "@seaart/conan-plugin-map";
import { ConanPluginPage } from "@seaart/conan-plugin-page";
import {
  StarunionTracker,
  type ConanPluginStarunionReportData,
} from "@seaart/conan-plugin-starunion";
import { ConanPluginUser } from "@seaart/conan-plugin-user";
import packageJson from "../../package.json";
import { CookieKey, LocalStorageKey } from "./constants";

const getCookie = (key: string): string => {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  return m?.[1] ? decodeURIComponent(m[1]) : "";
};

const setCookie = (key: string, value: string) => {
  if (typeof document === "undefined") return;
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${365 * 86400}`;
};

/**
 * Manual client events (async results / business completion).
 * DOM click/exposure use data-conan-* auto tracking — do not list those here.
 * Names must follow log_{action}_client once a tracking plan is confirmed.
 */
export const ReportName = {
  // Filled after user confirms the tracking plan (branch B).
} as const;

export type ReportName = (typeof ReportName)[keyof typeof ReportName];

export type ReportCustomParams = {
  // [ReportName.Example]: { id: string };
};

/** Page name rules — strip locale prefix; keep stable names without ids. */
const pageNameRules: [RegExp, string][] = [
  [/^\/?$/, "home_page"],
  [/^\/new\/?$/, "new_story_page"],
  [/^\/play\/?$/, "play_page"],
  [/^\/gallery\/?$/, "gallery_page"],
  [/^\/stories\/?$/, "stories_page"],
  [/^\/privacy\/?$/, "privacy_page"],
  [/^\/terms\/?$/, "terms_page"],
];

const LOCALE_PREFIX = /^\/(zh-CN|en|ja)(?=\/|$)/;

const getPageName = (pathname: string) => {
  const bare = pathname.replace(LOCALE_PREFIX, "") || "/";
  for (const [re, name] of pageNameRules) {
    if (re.test(bare)) return name;
  }
  return bare;
};

export let conanPluginUser:
  | ConanPluginUser<{ account_type?: number | string }>
  | undefined;

export const starunionTracker = new StarunionTracker<ReportCustomParams>({
  pendingStorageKey: LocalStorageKey.TrackPendingReports,
  pendingLimit: 100,
  contextNamespace: "context",
  waitStarTrack: { timeout: 5000 },
});

export const initStarunionTracker = (config: {
  appPlat?: "app" | "web" | "h5" | "auto";
  globalProperties?: Record<string, unknown>;
  starunionConfig: Record<string, unknown>;
}) => {
  return starunionTracker.init({
    starunionConfig: config.starunionConfig,
    starTrackInitOptions: {
      setting: {
        devMode:
          typeof localStorage !== "undefined" &&
          localStorage.getItem(LocalStorageKey.TrackDevMode) === "true",
        eventLimit: 20,
        timeInterval: 10,
      },
    },
    starunionPluginConfig: {
      appPlat: config.appPlat || "auto",
      appDeviceId: getCookie(CookieKey.DeviceId) || "",
      appVersion: getCookie(CookieKey.AppVersion) || packageJson.version,
      globalProperties: config.globalProperties,
      extendEvent: Object.values(ReportName),
      defaultAccountType: 2,
      onReport: (reportData) => {
        setCookie(
          CookieKey.CurrentPlatform,
          reportData.properties.platform_type || "web",
        );
        setCookie(
          CookieKey.CurrentPageName,
          reportData.properties.current_page_name || "",
        );
        return reportData;
      },
    },
    createConan: (createConanParams) => {
      conanPluginUser = new ConanPluginUser({
        visitorId: getCookie(CookieKey.VisitorId) || "",
        onUpdateVisitorId: (visitorId: string) =>
          setCookie(CookieKey.VisitorId, visitorId),
      });

      const conan = new Conan<ConanPluginStarunionReportData, ReportCustomParams>(
        {
          reporterConfig: { throttleWait: 0, time: 1 },
          printLog: false,
          exposureDelay: 500,
        },
        [
          new ConanPluginMap({
            useAnchorHrefAsModule: false,
          }),
          new ConanPluginAd({
            adParams: ["ad", "gad_source", "gad_campaignid", "gbraid", "gclid"],
            adIdParam: "gclid",
          }),
          new ConanPluginApp({
            deviceId: getCookie(CookieKey.DeviceId) || "",
            onUpdateDeviceId: (deviceId: string) =>
              setCookie(CookieKey.DeviceId, deviceId),
          }),
          new ConanPluginPage({ getPageName }),
          conanPluginUser,
          createConanParams.starunionPlugin,
        ],
      );

      return { conan };
    },
  });
};

export type { ConanPluginStarunionReportData };
