import { Menu, Tray } from "electron";

import type { AuthState } from "../../shared/types";
import { loadTrayIcon } from "./icon";
import type { WindowManager } from "./manager";

const TRAY_TOOLTIP = "Share The Spire Uploader";
const STATUS_TRUNCATE = 60;

export type TrayActions = {
  signIn: () => void;
  signOut: () => void;
  quit: () => void;
};

/**
 * Owns the system-tray icon and its context menu.
 *
 * The menu is rebuilt whenever auth state changes so the visible
 * "Sign in" / "Sign out" entry always reflects reality.
 */
export class TrayManager {
  private tray: Tray | null = null;
  private lastState: AuthState = { status: "signed-out" };

  constructor(
    private readonly windowManager: WindowManager,
    private readonly actions: TrayActions,
  ) {}

  /** Create the tray icon and bind its click handlers. Idempotent. */
  setup(): void {
    if (this.tray) return;
    this.tray = new Tray(loadTrayIcon());
    this.tray.setToolTip(TRAY_TOOLTIP);
    this.tray.on("click", () => this.windowManager.toggle());
    this.tray.on("double-click", () => void this.windowManager.show());
    this.rebuild(this.lastState);
  }

  /** Rebuild the context menu to reflect the given auth state. */
  rebuild(state: AuthState): void {
    this.lastState = state;
    if (!this.tray) return;

    const menu = Menu.buildFromTemplate([
      { label: this.statusLabel(state), enabled: false },
      { type: "separator" },
      {
        label: this.windowManager.isVisible() ? "Hide window" : "Show window",
        click: () => this.windowManager.toggle(),
      },
      state.status === "signed-in"
        ? { label: "Sign out", click: () => this.actions.signOut() }
        : { label: "Sign in with Discord", click: () => this.actions.signIn() },
      { type: "separator" },
      { label: "Quit", click: () => this.actions.quit() },
    ]);

    this.tray.setContextMenu(menu);
  }

  private statusLabel(state: AuthState): string {
    switch (state.status) {
      case "signed-in":
        return `Signed in as ${state.user.id}`;
      case "error":
        return `Error: ${truncate(state.message, STATUS_TRUNCATE)}`;
      case "signed-out":
        return "Not signed in";
    }
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
