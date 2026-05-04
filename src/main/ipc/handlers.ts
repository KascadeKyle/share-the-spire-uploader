import { ipcMain, shell } from "electron";

import type { AuthController } from "../auth/controller";
import { FRONTEND_URL } from "../config";
import type { Logger } from "../logger";
import { applyAutoLaunch, getOsAutoLaunchEnabled, saveSettings } from "../settings";
import type { Updater } from "../updater";
import type {
  AuthState,
  LogEntry,
  UpdateStatus,
  UploaderSettings,
} from "../../shared/types";

export type IpcDeps = {
  logger: Logger;
  auth: AuthController;
  updater: Updater;
  /** Read-only access to the current settings snapshot. */
  getSettings: () => UploaderSettings;
  /** Persist a new settings snapshot and broadcast the change. */
  setSettings: (next: UploaderSettings) => Promise<void>;
};

/**
 * Wire up all `ipcMain.handle(...)` channels used by the renderer.
 *
 * Channel names intentionally mirror the methods exposed in `src/preload`;
 * the shared channel name is the contract between the two processes.
 */
export function registerIpcHandlers(deps: IpcDeps): void {
  const { logger, auth, updater, getSettings, setSettings } = deps;

  ipcMain.handle("auth:getState", (): Promise<AuthState> => auth.refresh());
  ipcMain.handle("auth:signIn", (): Promise<AuthState> => auth.signIn());
  ipcMain.handle("auth:signOut", (): Promise<AuthState> => auth.signOut());

  ipcMain.handle("settings:get", async (): Promise<UploaderSettings> => getSettings());
  ipcMain.handle(
    "settings:setOpenAtLoginHidden",
    async (_e, value: boolean): Promise<UploaderSettings> => {
      const requested = !!value;
      applyAutoLaunch(requested);

      // Trust the OS, not our hope. If Windows refused (e.g. Startup Apps
      // disabled the entry), the checkbox should reflect reality.
      const actual = getOsAutoLaunchEnabled();
      const next: UploaderSettings = {
        ...getSettings(),
        openAtLoginHidden: actual,
      };
      await saveSettings(next);

      if (actual === requested) {
        logger.append(
          actual
            ? "Auto-start at login enabled (hidden)."
            : "Auto-start at login disabled.",
        );
      } else {
        logger.append(
          `Auto-start change did not stick: requested=${requested}, OS=${actual}. ` +
            `Check Task Manager > Startup apps for "Share The Spire Uploader".`,
        );
      }

      await setSettings(next);
      return next;
    },
  );
  ipcMain.handle(
    "settings:setAutoInstallUpdates",
    async (_e, value: boolean): Promise<UploaderSettings> => {
      const next: UploaderSettings = {
        ...getSettings(),
        autoInstallUpdates: !!value,
      };
      await saveSettings(next);
      updater.applyAutoInstall(next.autoInstallUpdates);
      logger.append(
        next.autoInstallUpdates
          ? "Updates will install automatically when you quit the app."
          : "Updates will wait for you to click \"Install and restart\".",
      );
      await setSettings(next);
      return next;
    },
  );

  ipcMain.handle("update:getStatus", async (): Promise<UpdateStatus> => updater.getStatus());
  ipcMain.handle("update:install", async (): Promise<void> => updater.installNow());

  ipcMain.handle("log:getBuffer", async (): Promise<LogEntry[]> => logger.snapshot());

  ipcMain.handle("profile:open", async (): Promise<void> => {
    const state = auth.state();
    if (state.status !== "signed-in") return;
    const userId = encodeURIComponent(state.user.id);
    await shell.openExternal(`${FRONTEND_URL}/profile/${userId}`);
  });
}
