/** Storage keys for Conan / StarUnion client tracking. */
export const LocalStorageKey = {
  TrackDevMode: "track_dev_mode",
  TrackPendingReports: "track_pending_reports",
} as const;

export const CookieKey = {
  DeviceId: "device_id",
  VisitorId: "visitor_id",
  AppVersion: "app_version",
  UserInfo: "user_info",
  CurrentPlatform: "sv_platform",
  CurrentPageName: "sv_page_name",
} as const;
