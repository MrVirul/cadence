// App and site URLs derived from Vite environment variables.
// Fallbacks allow local development out of the box.

const rawAppUrl = (import.meta.env["VITE_APP_URL"] as string | undefined) || "";
const rawSiteUrl =
  (import.meta.env["VITE_SITE_URL"] as string | undefined) || "";

export const APP_URL = rawAppUrl.replace(/\/+$/, "") || "http://localhost:3001";
export const SITE_URL =
  rawSiteUrl.replace(/\/+$/, "") || "http://localhost:3000";
