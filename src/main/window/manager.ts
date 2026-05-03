import { app, BrowserWindow } from "electron";
import * as path from "node:path";

import { loadWindowIcon } from "./icon";

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 620;
const WINDOW_TITLE = "Share The Spire Uploader";

/**
 * Manages the lifecycle of the single uploader window.
 *
 * The window is intentionally *not* destroyed when the user clicks the close
 * button — instead it hides and stays available via the tray. Set
 * `setQuitting(true)` before `app.quit()` to allow the window to close for
 * good.
 */
export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private quitting = false;

  /** Mark that the app is shutting down so close handlers stop hiding. */
  setQuitting(quitting: boolean): void {
    this.quitting = quitting;
  }

  /** The current window, if one exists and hasn't been destroyed. */
  current(): BrowserWindow | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return null;
    return this.mainWindow;
  }

  /** Whether the window is currently visible to the user. */
  isVisible(): boolean {
    const win = this.current();
    return win ? win.isVisible() : false;
  }

  /** Create the window if it doesn't exist yet, optionally showing it. */
  async open(options: { show: boolean }): Promise<BrowserWindow> {
    const existing = this.current();
    if (existing) {
      if (options.show) {
        if (existing.isMinimized()) existing.restore();
        existing.show();
        existing.focus();
      }
      return existing;
    }

    const win = new BrowserWindow({
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      title: WINDOW_TITLE,
      icon: loadWindowIcon(),
      show: options.show,
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.on("close", (e) => {
      if (!this.quitting) {
        e.preventDefault();
        win.hide();
      }
    });

    win.on("closed", () => {
      if (this.mainWindow === win) this.mainWindow = null;
    });

    this.mainWindow = win;
    await win.loadFile(rendererHtmlPath());
    return win;
  }

  /** Bring the window to the foreground, creating it if necessary. */
  async show(): Promise<void> {
    await this.open({ show: true });
  }

  /** Toggle window visibility, creating it on first show. */
  toggle(): void {
    const win = this.current();
    if (!win || !win.isVisible()) {
      void this.show();
    } else {
      win.hide();
    }
  }

  /** Send `payload` over `channel` to every open BrowserWindow. */
  broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, payload);
    }
  }
}

function preloadPath(): string {
  return path.join(app.getAppPath(), "dist", "preload", "index.js");
}

function rendererHtmlPath(): string {
  return path.join(app.getAppPath(), "src", "renderer", "index.html");
}
