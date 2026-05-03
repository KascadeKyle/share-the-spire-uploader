import "./load-env";
import { app } from "electron";

import { AuthController } from "./auth/controller";
import { FRONTEND_URL } from "./config";
import { registerIpcHandlers } from "./ipc/handlers";
import { Logger } from "./logger";
import {
  applyAutoLaunch,
  launchedHidden,
  loadSettings,
} from "./settings";
import { setupAutoUpdater } from "./updater";
import { SaveWatcher } from "./watcher/save-watcher";
import { WindowManager } from "./window/manager";
import { TrayManager } from "./window/tray";
import type { AuthState, UploaderSettings } from "../shared/types";

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const logger = new Logger();
const windowManager = new WindowManager();
const auth = new AuthController(logger);

const watcher = new SaveWatcher({
  onLog: (msg) => logger.append(msg),
  getToken: () => auth.token(),
});

const tray = new TrayManager(windowManager, {
  signIn: () => void auth.signIn(),
  signOut: () => void auth.signOut(),
  quit: () => {
    windowManager.setQuitting(true);
    app.quit();
  },
});

let currentSettings: UploaderSettings = {
  openAtLoginHidden: false,
  autoInstallUpdates: false,
};

const updater = setupAutoUpdater({
  logger,
  getAutoInstall: () => currentSettings.autoInstallUpdates,
  onStatusChange: (status) =>
    windowManager.broadcast("update:statusChanged", status),
});

logger.subscribe((entry) => windowManager.broadcast("log:append", entry));

auth.onChange(async (state) => {
  await syncWatcher(state);
  windowManager.broadcast("auth:changed", state);
  tray.rebuild(state);
});

registerIpcHandlers({
  logger,
  auth,
  updater,
  getSettings: () => currentSettings,
  setSettings: async (next) => {
    currentSettings = next;
    windowManager.broadcast("settings:changed", currentSettings);
  },
});

async function syncWatcher(state: AuthState): Promise<void> {
  if (state.status === "signed-in") {
    await watcher.start();
  } else {
    watcher.stop();
  }
}

app.on("second-instance", () => void windowManager.show());

app.on("activate", () => void windowManager.show());

// Closing the last window must NOT quit — the app lives in the tray until
// the user picks "Quit" from the tray menu.
app.on("window-all-closed", () => {
  /* intentionally empty */
});

app.on("before-quit", () => {
  windowManager.setQuitting(true);
  watcher.stop();
});

app.whenReady().then(async () => {
  logger.append("Spire Uploader Initiated");
  logger.append(`Frontend URL: ${FRONTEND_URL}`);

  currentSettings = await loadSettings();
  applyAutoLaunch(currentSettings.openAtLoginHidden);

  await auth.hydrate();
  tray.setup();

  const startHidden = launchedHidden() && currentSettings.openAtLoginHidden;
  if (startHidden) {
    logger.append("Started in background (launched at login).");
  } else {
    await windowManager.open({ show: true });
  }

  // Validating the token kicks off the watcher (via `auth.onChange`) without
  // requiring a renderer window to be open and ready.
  await auth.refresh();
});
