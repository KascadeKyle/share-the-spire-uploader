/**
 * Types that form the contract between the main, preload, and renderer
 * processes — and the shape of resources returned by the share-spire API.
 *
 * Anything that crosses an IPC boundary lives here so the three processes
 * stay in sync without main importing from preload (or vice versa).
 */

/** A user record as returned by the share-spire API. */
export type ApiUser = {
  id: string;
  created_at: number;
  avatar_url: string | null;
};

/** Snapshot of the user's authentication state, as observed by the main process. */
export type AuthState =
  | { status: "signed-out" }
  | { status: "signed-in"; user: ApiUser }
  | { status: "error"; message: string };

/** A single line in the in-app log. `ts` is ms since epoch on the producer's clock. */
export type LogEntry = {
  ts: number;
  message: string;
};

/** Persisted user preferences. */
export type UploaderSettings = {
  openAtLoginHidden: boolean;
  /**
   * When true, downloaded updates install silently the next time the user
   * quits the app. When false (the default), the user must explicitly click
   * "Install and restart" in the update banner — no version reaches their
   * machine without consent.
   */
  autoInstallUpdates: boolean;
};

/**
 * Current state of the in-app update flow, broadcast by the main process
 * so the renderer can show / hide its "update available" banner.
 */
export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string };
