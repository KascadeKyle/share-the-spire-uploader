import { ipcMain, shell } from "electron";

import type { AuthController } from "../auth/controller";
import { FRONTEND_URL } from "../config";
import type { Logger } from "../logger";
import { applyAutoLaunch, saveSettings } from "../settings";
import type { AuthState, LogEntry, UploaderSettings } from "../../shared/types";

export type IpcDeps = {
  logger: Logger;
  auth: AuthController;
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
  const { logger, auth, getSettings, setSettings } = deps;

  ipcMain.handle("auth:getState", (): Promise<AuthState> => auth.refresh());
  ipcMain.handle("auth:signIn", (): Promise<AuthState> => auth.signIn());
  ipcMain.handle("auth:signOut", (): Promise<AuthState> => auth.signOut());

  ipcMain.handle("settings:get", async (): Promise<UploaderSettings> => getSettings());
  ipcMain.handle(
    "settings:setOpenAtLoginHidden",
    async (_e, value: boolean): Promise<UploaderSettings> => {
      const next: UploaderSettings = {
        ...getSettings(),
        openAtLoginHidden: !!value,
      };
      await saveSettings(next);
      applyAutoLaunch(next.openAtLoginHidden);
      logger.append(
        next.openAtLoginHidden
          ? "Auto-start at login enabled (hidden)."
          : "Auto-start at login disabled.",
      );
      await setSettings(next);
      return next;
    },
  );

  ipcMain.handle("log:getBuffer", async (): Promise<LogEntry[]> => logger.snapshot());

  ipcMain.handle("profile:open", async (): Promise<void> => {
    const state = auth.state();
    if (state.status !== "signed-in") return;
    const userId = encodeURIComponent(state.user.id);
    await shell.openExternal(`${FRONTEND_URL}/profile/${userId}`);
  });
}
