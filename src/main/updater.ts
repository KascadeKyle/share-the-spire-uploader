import { app } from "electron";
import log from "electron-log";
import { autoUpdater } from "electron-updater";

import type { Logger } from "./logger";
import type { UpdateStatus } from "../shared/types";

/** How often to re-check for updates while the app is running. */
const POLL_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** Wait this long after launch before reaching out to the network. */
const INITIAL_CHECK_DELAY_MS = 5_000;

export type UpdaterOptions = {
  logger: Logger;
  /** Read the user's "auto-install on quit" preference at any time. */
  getAutoInstall: () => boolean;
  /** Called whenever the public update status changes. */
  onStatusChange: (status: UpdateStatus) => void;
};

/** Surface the rest of the app needs to interact with the updater. */
export type Updater = {
  /** Current update status (idle / downloading / ready). */
  getStatus(): UpdateStatus;
  /** Re-apply the auto-install preference (call when the setting changes). */
  applyAutoInstall(autoInstall: boolean): void;
  /** Quit the app and install the downloaded update. No-op if none is ready. */
  installNow(): void;
};

/**
 * Wire `electron-updater` to GitHub Releases.
 *
 * Behaviour:
 *   - Skipped entirely in dev (no packaged app means no update metadata).
 *   - Checks once shortly after launch, then every {@link POLL_INTERVAL_MS}.
 *   - Always downloads in the background as soon as an update is available.
 *   - **Does not install automatically by default.** The renderer shows an
 *     "Install and restart" banner when {@link UpdateStatus.kind} flips to
 *     `"ready"`; the user clicks it (which calls {@link Updater.installNow}).
 *   - If the user toggles *"Install updates automatically when I quit"* on,
 *     `autoInstallOnAppQuit` is flipped on too, so a normal Quit-from-tray
 *     applies the pending update without further interaction.
 *   - All updater chatter goes through `electron-log` (file + stderr) and is
 *     mirrored into the in-app log so users can see what's happening.
 */
export function setupAutoUpdater(opts: UpdaterOptions): Updater {
  const { logger, getAutoInstall, onStatusChange } = opts;

  if (!app.isPackaged) {
    logger.append("Auto-updater disabled (running unpackaged).");
    return noopUpdater();
  }

  log.transports.file.level = "info";
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = getAutoInstall();

  let status: UpdateStatus = { kind: "idle" };
  const setStatus = (next: UpdateStatus): void => {
    status = next;
    onStatusChange(next);
  };

  autoUpdater.on("checking-for-update", () => {
    logger.append("Checking for updates…");
  });
  autoUpdater.on("update-available", (info) => {
    logger.append(`Update available: ${info.version}. Downloading…`);
    setStatus({ kind: "downloading", version: info.version, percent: 0 });
  });
  autoUpdater.on("update-not-available", () => {
    logger.append("No update available.");
    if (status.kind !== "ready") setStatus({ kind: "idle" });
  });
  autoUpdater.on("download-progress", (p) => {
    const percent = Math.max(0, Math.min(100, Math.round(p.percent)));
    logger.append(`Downloading update: ${percent}%`);
    if (status.kind === "downloading") {
      setStatus({ kind: "downloading", version: status.version, percent });
    }
  });
  autoUpdater.on("update-downloaded", (info) => {
    logger.append(
      `Update ${info.version} downloaded. ` +
        (autoUpdater.autoInstallOnAppQuit
          ? "It will install when you quit the app."
          : 'Click "Install and restart" in the window to apply it.'),
    );
    setStatus({ kind: "ready", version: info.version });
  });
  autoUpdater.on("error", (err) => {
    logger.append(`Updater error: ${err?.message ?? String(err)}`);
  });

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      logger.append(
        `Update check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  };

  setTimeout(check, INITIAL_CHECK_DELAY_MS);
  setInterval(check, POLL_INTERVAL_MS);

  return {
    getStatus: () => status,
    applyAutoInstall: (autoInstall: boolean) => {
      autoUpdater.autoInstallOnAppQuit = autoInstall;
    },
    installNow: () => {
      if (status.kind !== "ready") return;
      // `isSilent: true, isForceRunAfter: true` → no extra installer UI,
      // app re-launches on its own once NSIS finishes.
      autoUpdater.quitAndInstall(true, true);
    },
  };
}

function noopUpdater(): Updater {
  return {
    getStatus: () => ({ kind: "idle" }),
    applyAutoInstall: () => {},
    installNow: () => {},
  };
}
