/**
 * URLs the uploader talks to.
 *
 * Defaults target production. To override locally, copy `.env.example` to
 * `.env` and uncomment the lines you want to change. See `load-env.ts` for
 * how the file is discovered at runtime.
 */
export const FRONTEND_URL =
  process.env["SHARE_SPIRE_FRONTEND_URL"] ?? "https://sharethespire.com";

export const API_URL =
  process.env["SHARE_SPIRE_API_URL"] ?? "https://sharethespire.com/api";
