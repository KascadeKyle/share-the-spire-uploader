import { app } from "electron";
import { promises as fs } from "node:fs";
import * as path from "node:path";

import type { UploaderSettings } from "../shared/types";

const SETTINGS_FILE = "settings.json";

/** CLI flag passed to the auto-launched binary so we know to start hidden. */
export const HIDDEN_ARG = "--hidden";

const DEFAULTS: UploaderSettings = {
  openAtLoginHidden: false,
  autoInstallUpdates: false,
};

/** Read the persisted settings file or return defaults if it doesn't exist. */
export async function loadSettings(): Promise<UploaderSettings> {
  try {
    const buf = await fs.readFile(settingsFilePath(), "utf8");
    const parsed = JSON.parse(buf) as Partial<UploaderSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULTS };
    throw err;
  }
}

/** Persist the given settings snapshot to the user-data folder. */
export async function saveSettings(settings: UploaderSettings): Promise<void> {
  const file = settingsFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(settings, null, 2), "utf8");
}

/**
 * Sync the OS-level login item with the given preference.
 *
 * When `openAtLoginHidden` is true, the app is registered to launch at
 * login with the `--hidden` arg so the entry point knows not to show the
 * window.
 *
 * On Windows we pass `path` and `args` explicitly so that subsequent
 * `getLoginItemSettings({path, args})` calls can match the entry — without
 * a matching path/args pair, Windows reports `openAtLogin: false` even when
 * the registry entry exists.
 */
export function applyAutoLaunch(openAtLoginHidden: boolean): void {
  const options: Parameters<typeof app.setLoginItemSettings>[0] = {
    openAtLogin: openAtLoginHidden,
    path: process.execPath,
    args: openAtLoginHidden ? [HIDDEN_ARG] : [],
  };
  // `openAsHidden` is a macOS-only option; passing it on other platforms is
  // a no-op but we keep the payload clean.
  if (process.platform === "darwin") {
    options.openAsHidden = openAtLoginHidden;
  }
  app.setLoginItemSettings(options);
}

/**
 * Read the OS-level auto-launch state for this app. Pass the same `path`
 * and `args` we registered with so Windows can locate the entry — see
 * the comment in `applyAutoLaunch` above.
 */
export function getOsAutoLaunchEnabled(): boolean {
  try {
    return app.getLoginItemSettings({
      path: process.execPath,
      args: [HIDDEN_ARG],
    }).openAtLogin;
  } catch {
    return false;
  }
}

/**
 * True when the current process was launched with the hidden flag,
 * i.e. it was started by the OS at login and should not show its window.
 */
export function launchedHidden(): boolean {
  if (process.argv.includes(HIDDEN_ARG)) return true;
  try {
    const settings = app.getLoginItemSettings();
    return settings.wasOpenedAtLogin && settings.wasOpenedAsHidden;
  } catch {
    return false;
  }
}

function settingsFilePath(): string {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}
