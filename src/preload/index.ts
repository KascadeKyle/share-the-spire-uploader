import { contextBridge, ipcRenderer } from "electron";

import type {
  AuthState,
  LogEntry,
  UpdateStatus,
  UploaderSettings,
} from "../shared/types";

/**
 * The `window.uploader` API exposed to the renderer via `contextBridge`.
 *
 * Channel names mirror the handlers registered in `src/main/ipc/handlers.ts`.
 * Type definitions for the renderer's view of this API live in
 * `src/renderer/types.ts` and must stay in sync with this file.
 */
const api = {
  getAuthState: (): Promise<AuthState> => ipcRenderer.invoke("auth:getState"),
  signIn: (): Promise<AuthState> => ipcRenderer.invoke("auth:signIn"),
  signOut: (): Promise<AuthState> => ipcRenderer.invoke("auth:signOut"),
  onAuthChanged: (listener: (state: AuthState) => void): (() => void) =>
    subscribe("auth:changed", listener),

  getSettings: (): Promise<UploaderSettings> => ipcRenderer.invoke("settings:get"),
  setOpenAtLoginHidden: (value: boolean): Promise<UploaderSettings> =>
    ipcRenderer.invoke("settings:setOpenAtLoginHidden", value),
  setAutoInstallUpdates: (value: boolean): Promise<UploaderSettings> =>
    ipcRenderer.invoke("settings:setAutoInstallUpdates", value),
  onSettingsChanged: (listener: (settings: UploaderSettings) => void): (() => void) =>
    subscribe("settings:changed", listener),

  getLogBuffer: (): Promise<LogEntry[]> => ipcRenderer.invoke("log:getBuffer"),
  onLogAppend: (listener: (entry: LogEntry) => void): (() => void) =>
    subscribe("log:append", listener),

  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke("update:getStatus"),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("update:install"),
  onUpdateStatusChanged: (
    listener: (status: UpdateStatus) => void,
  ): (() => void) => subscribe("update:statusChanged", listener),

  openProfile: (): Promise<void> => ipcRenderer.invoke("profile:open"),
};

contextBridge.exposeInMainWorld("uploader", api);

/** Subscribe to a one-arg IPC channel and return an unsubscribe function. */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void =>
    listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}
