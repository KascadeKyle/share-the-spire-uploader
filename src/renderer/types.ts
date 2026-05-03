// Mirrors of the IPC types exposed by `preload.ts` via `contextBridge`.
//
// They are duplicated here (rather than imported from the main-process source)
// because the renderer is compiled as a separate ESM bundle with its own
// `rootDir` — keeping its inputs free of any non-renderer files. These types
// must stay in lock-step with `src/types.ts` and `src/preload.ts`.

export type ApiUser = {
  id: string;
  created_at: number;
  avatar_url: string | null;
};

export type AuthState =
  | { status: "signed-out" }
  | { status: "signed-in"; user: ApiUser }
  | { status: "error"; message: string };

export type UploaderSettings = {
  openAtLoginHidden: boolean;
  autoInstallUpdates: boolean;
};

export type LogEntry = {
  ts: number;
  message: string;
};

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string };

export type UploaderApi = {
  getAuthState: () => Promise<AuthState>;
  signIn: () => Promise<AuthState>;
  signOut: () => Promise<AuthState>;
  onAuthChanged: (listener: (state: AuthState) => void) => () => void;

  getSettings: () => Promise<UploaderSettings>;
  setOpenAtLoginHidden: (value: boolean) => Promise<UploaderSettings>;
  setAutoInstallUpdates: (value: boolean) => Promise<UploaderSettings>;
  onSettingsChanged: (
    listener: (settings: UploaderSettings) => void,
  ) => () => void;

  getLogBuffer: () => Promise<LogEntry[]>;
  onLogAppend: (listener: (entry: LogEntry) => void) => () => void;

  getUpdateStatus: () => Promise<UpdateStatus>;
  installUpdate: () => Promise<void>;
  onUpdateStatusChanged: (
    listener: (status: UpdateStatus) => void,
  ) => () => void;

  openProfile: () => Promise<void>;
};

declare global {
  interface Window {
    uploader: UploaderApi;
  }
}
