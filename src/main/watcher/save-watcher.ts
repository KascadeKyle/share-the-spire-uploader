import { app } from "electron";
import { type FSWatcher, promises as fs, watch as watchFs } from "node:fs";
import * as path from "node:path";

import { ApiError, uploadSave } from "../api/client";

const SAVE_FILENAME = "current_run.save";
const DEBOUNCE_MS = 750;
const RESCAN_INTERVAL_MS = 30_000;

export type WatcherEvents = {
  onLog: (message: string) => void;
  getToken: () => string | null;
};

type WatchedDir = {
  dir: string;
  watcher: FSWatcher;
};

/**
 * Returns the root directory under `%APPDATA%` that contains all
 * Slay the Spire 2 save profiles, e.g.:
 *
 *   `C:\Users\<name>\AppData\Roaming\SlayTheSpire2\steam`
 *
 * On non-Windows hosts we fall back to Electron's `appData` path so the
 * code remains compilable / testable, even though the real game only ships
 * on Windows.
 */
export function spire2SaveRoot(): string {
  const appData =
    process.platform === "win32"
      ? (process.env["APPDATA"] ?? app.getPath("appData"))
      : app.getPath("appData");
  return path.join(appData, "SlayTheSpire2", "steam");
}

/**
 * Watches every `<root>/<steamId>/<profileN>/saves` directory for writes to
 * `current_run.save` and uploads the file when it changes.
 *
 * The watcher rescans the root periodically so newly-created profiles are
 * picked up automatically without restarting the app. A short debounce
 * ensures bursty writes (which the game emits) collapse into a single upload.
 */
export class SaveWatcher {
  private readonly events: WatcherEvents;
  private readonly root: string;
  private readonly watched = new Map<string, WatchedDir>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly inFlight = new Set<string>();
  private rescanTimer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(events: WatcherEvents, rootOverride?: string) {
    this.events = events;
    this.root = rootOverride ?? spire2SaveRoot();
  }

  /** Begin watching. Idempotent — repeat calls are no-ops while running. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.events.onLog(`Watching for saves under ${this.root}`);
    await this.rescan();
    this.rescanTimer = setInterval(() => {
      this.rescan().catch((err) => {
        this.events.onLog(`Rescan failed: ${describeError(err)}`);
      });
    }, RESCAN_INTERVAL_MS);
  }

  /** Stop watching, close all FS watchers, and clear pending uploads. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer);
      this.rescanTimer = null;
    }
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    for (const w of this.watched.values()) closeQuietly(w.watcher);
    this.watched.clear();
    this.events.onLog("Save watcher stopped.");
  }

  /**
   * Sync the set of active watchers with the directories currently on disk:
   * - close watchers for directories that have disappeared
   * - open watchers for new directories and upload any pre-existing save.
   */
  private async rescan(): Promise<void> {
    let dirs: string[];
    try {
      dirs = await discoverSaveDirs(this.root);
    } catch (err) {
      this.events.onLog(`Could not enumerate save dirs: ${describeError(err)}`);
      return;
    }

    const seen = new Set(dirs);
    for (const [dir, w] of this.watched) {
      if (!seen.has(dir)) {
        closeQuietly(w.watcher);
        this.watched.delete(dir);
        this.events.onLog(`Stopped watching ${dir} (no longer present).`);
      }
    }

    for (const dir of dirs) {
      if (this.watched.has(dir)) continue;
      await this.watchDir(dir);
    }
  }

  private async watchDir(dir: string): Promise<void> {
    try {
      const watcher = watchFs(dir, { persistent: false }, (_event, filename) => {
        if (filename !== SAVE_FILENAME) return;
        this.scheduleUpload(path.join(dir, SAVE_FILENAME));
      });
      watcher.on("error", (err) => {
        this.events.onLog(`Watcher error for ${dir}: ${describeError(err)}`);
      });
      this.watched.set(dir, { dir, watcher });
      this.events.onLog(`Watching ${dir}`);

      // Upload any save already present in this newly-watched dir. This
      // covers both the initial sweep at app start and any profile that
      // appears later (e.g. user creates a second profile while running).
      await this.uploadIfPresent(dir);
    } catch (err) {
      this.events.onLog(`Failed to watch ${dir}: ${describeError(err)}`);
    }
  }

  private async uploadIfPresent(dir: string): Promise<void> {
    const file = path.join(dir, SAVE_FILENAME);
    try {
      const stat = await fs.stat(file);
      if (stat.isFile()) {
        this.events.onLog(`Found existing ${SAVE_FILENAME} in ${dir}.`);
        this.scheduleUpload(file);
      }
    } catch (err) {
      if (!isNotFound(err)) {
        this.events.onLog(`Could not stat ${file}: ${describeError(err)}`);
      }
    }
  }

  /** Coalesce bursty writes into a single upload after `DEBOUNCE_MS`. */
  private scheduleUpload(filePath: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.uploadOnce(filePath).catch((err) => {
        this.events.onLog(`Upload failed: ${describeError(err)}`);
      });
    }, DEBOUNCE_MS);
    this.debounceTimers.set(filePath, t);
  }

  private async uploadOnce(filePath: string): Promise<void> {
    if (this.inFlight.has(filePath)) {
      // A change arrived mid-upload; reschedule so we send the latest.
      this.scheduleUpload(filePath);
      return;
    }

    const token = this.events.getToken();
    if (!token) {
      this.events.onLog("Skipping upload: not signed in.");
      return;
    }

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return;
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }

    this.inFlight.add(filePath);
    try {
      this.events.onLog(`Uploading ${path.basename(filePath)}…`);
      await uploadSave(token, filePath);
      this.events.onLog(`Uploaded ${filePath}`);
    } catch (err) {
      if (err instanceof ApiError) {
        this.events.onLog(`Upload rejected (${err.status}): ${err.message}`);
      } else {
        throw err;
      }
    } finally {
      this.inFlight.delete(filePath);
    }
  }
}

/**
 * Walk `<root>/<steamId>/<profileN>/saves` and collect every directory that
 * could contain a `current_run.save`. We watch the directory (not the file)
 * so that creates after a fresh run are picked up too.
 */
async function discoverSaveDirs(root: string): Promise<string[]> {
  const out: string[] = [];

  let steamIds: string[];
  try {
    steamIds = await fs.readdir(root);
  } catch (err) {
    if (isNotFound(err)) return out;
    throw err;
  }

  for (const steamId of steamIds) {
    const steamDir = path.join(root, steamId);
    let profiles: string[];
    try {
      profiles = await fs.readdir(steamDir);
    } catch {
      continue;
    }
    for (const profile of profiles) {
      const savesDir = path.join(steamDir, profile, "saves");
      try {
        const stat = await fs.stat(savesDir);
        if (stat.isDirectory()) out.push(savesDir);
      } catch {
        /* not a profile dir; ignore */
      }
    }
  }

  return out;
}

function closeQuietly(watcher: FSWatcher): void {
  try {
    watcher.close();
  } catch {
    /* ignore — best-effort teardown */
  }
}

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
