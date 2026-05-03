# Share The Spire Uploader

A small cross-platform desktop app that automatically uploads your **Slay the Spire 2** saves to [sharethespire.com](https://sharethespire.com/) while you play.

Built with Electron and TypeScript. The app lives in your system tray, signs in via the website's Discord OAuth, and watches the game's save folder for new runs.

---

## What it does

Once you're signed in, the uploader runs quietly in the background and watches your Slay the Spire 2 save folder. Every time the game writes a new run state to disk, your save is sent to Share The Spire so it shows up on your profile — no manual exports, no copy-pasting files.

The app lives in your **system tray** (the little icons next to the clock on Windows, or the menu bar on macOS). There's no main window taking up space on your taskbar — just a single tray icon doing its thing while you play.

## Download

Grab the latest installer from the [GitHub Releases page](https://github.com/KascadeKyle/share-the-spire-uploader/releases) — it's a single `Share The Spire Uploader-Setup-x.y.z.exe`. Run it, follow the prompts, and the app will install per-user (no admin needed) and create Start-menu and desktop shortcuts.

The first time you run an unsigned installer, Windows SmartScreen may show a *"Windows protected your PC"* dialog. Click **More info → Run anyway**.

Updates are downloaded automatically in the background, but **nothing is installed without your consent**. When a new version is ready, an *Update ready* banner appears at the top of the window with an **Install and restart** button — you decide when to apply it. If you'd rather not be bothered, the *Install updates automatically when I quit the app* setting flips updates to silent install on next quit.

## Getting started

1. **Open the app.** The first time you launch it, a small setup window appears with a *Sign in with Discord* button. After that, the app lives in the tray.
2. **Click sign in.** Your default browser opens to [sharethespire.com](https://sharethespire.com/).
   - If you're not already signed in, finish the normal Discord login on the site.
   - If you're already signed in, the site recognizes you instantly.
3. **Approve the uploader.** The site hands a secure token back to the app and your browser tab can be closed.
4. **Close the window.** Hit the X — the app keeps running in the tray.
5. **Play the game.** That's it — your saves will be uploaded automatically as they're written.

You only need to sign in once. The app remembers you on the next launch.

## The tray icon

Click the tray icon to show or hide the window. Right-click it for a menu with:

- Your current sign-in status
- *Show window* — pops the window back open
- *Sign in with Discord* / *Sign out*
- *Quit* — actually exits the uploader (closing the window does not)

Turn on **Start app automatically in background** in the window's settings to have it auto-launch with Windows next time you sign in, with no window — just the tray icon.

## Where saves come from

The uploader looks in the standard Slay the Spire 2 save location:

```
%APPDATA%\SlayTheSpire2\steam\<your-steam-id>\<profile>\saves\current_run.save
```

If you have multiple Steam profiles, all of them are watched automatically. New profiles created while the app is running are picked up too.

## Signing out

Right-click the tray icon and pick **Sign out**, or use the *Sign out* button in the window. Your local token is removed and the uploader stops sending anything until you sign in again. You can also revoke access from your Share The Spire account page in the browser.

## Troubleshooting

- **"Not signed in" in the log.** Click the tray icon and pick *Sign in with Discord*, or open the window and use the button there.
- **Nothing is uploading.** Make sure the game is actually running and writing saves, and that the tray icon is still there. Open the window from the tray to see the status log — each file shows up as it's sent.
- **Tray icon disappeared.** The app may have quit. Launch it again from the Start menu; the icon will return.
- **Browser didn't open.** Copy the URL printed in the app's log and paste it into your browser manually.

For everything else, head to [sharethespire.com](https://sharethespire.com/) and reach out from there.

---

## Development

### Requirements

- Node.js 20 or newer
- npm 10 or newer

### Setup

```bash
npm install
```

### Run locally

```bash
npm run dev
```

This builds the TypeScript sources and launches Electron. By default it talks to production; to point at a local backend, copy `.env.example` to `.env` and uncomment the relevant lines.

### Other scripts

| Script | What it does |
| --- | --- |
| `npm run build` | Type-check and emit JS to `dist/`. |
| `npm run build:main` | Build the main + preload sources only. |
| `npm run build:renderer` | Build the renderer sources only. |
| `npm run typecheck` | Run TypeScript with `--noEmit` over both projects. |
| `npm run clean` | Delete the `dist/` directory. |
| `npm run start` | Build, then launch Electron (alias of `dev`). |
| `npm run pack` | Package the app into `release/win-unpacked/` without producing an installer (fast smoke-test of a packaged build). |
| `npm run dist` | Build a full NSIS installer in `release/` (no upload). |
| `npm run release` | Build *and* publish to GitHub Releases. Requires `GH_TOKEN` in the environment. |

### Packaging & releases

Distribution is handled by [`electron-builder`](https://www.electron.build/) and the configuration lives in the `build` block of `package.json`. Releases are produced on Windows and uploaded to [GitHub Releases](https://github.com/KascadeKyle/share-the-spire-uploader/releases). The auto-updater (`electron-updater`) reads from the same release feed.

**Required asset** — add a real Windows icon to `images/icon.ico` (256×256 multi-resolution `.ico`) before producing a release build. Without it, `electron-builder` will fail. The same `images/` folder is also where the runtime tray/window PNG icons live — drop in `share-the-spire-32.png` and `share-the-spire-64.png` to replace the synthetic purple-square fallback.

**Cutting a release:**

1. Bump `version` in `package.json` and commit.
2. Tag the commit: `git tag v0.1.1 && git push origin v0.1.1`.
3. The `Release` GitHub Actions workflow (`.github/workflows/release.yml`) runs on `windows-latest`, builds the installer, and uploads it to a **draft** release together with the `latest.yml` metadata file the auto-updater needs.
4. Open the draft on GitHub, edit the release notes, and click **Publish release**. The auto-updater only sees published (non-draft) releases, so this acts as a manual gate.

To build locally without publishing, run `npm run dist` and look in `release/`. To build *and* publish from your machine instead of CI, set `GH_TOKEN` to a personal access token with `repo` scope and run `npm run release`.

**Code signing** is currently *not* configured, so installer downloads will trip Windows SmartScreen until enough users vouch for the binary. To enable signing later, set the `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` env vars in the workflow — `electron-builder` picks them up automatically.

### Project layout

The source is split by Electron process — `main/`, `preload/`, `renderer/` — plus a small `shared/` folder for types that cross IPC boundaries.

```
uploader/
├─ images/                       PNG assets (tray + window icons)
├─ src/
│  ├─ main/                      Main process
│  │  ├─ index.ts                Electron entry point — wires everything together
│  │  ├─ load-env.ts             Loads ./.env relative to package.json
│  │  ├─ config.ts               Frontend / API URLs (env-overridable)
│  │  ├─ logger.ts               In-memory ring buffer + fan-out for log lines
│  │  ├─ settings.ts             Persisted user preferences (auto-start, etc.)
│  │  ├─ auth/
│  │  │  ├─ controller.ts        In-memory auth state + change notifications
│  │  │  ├─ oauth.ts             Loopback OAuth flow against the website
│  │  │  └─ storage.ts           Read/write of the on-disk auth token
│  │  ├─ api/
│  │  │  └─ client.ts            REST client for sharethespire.com
│  │  ├─ watcher/
│  │  │  └─ save-watcher.ts      Save-folder watcher that drives uploads
│  │  ├─ window/
│  │  │  ├─ manager.ts           BrowserWindow lifecycle + IPC broadcast
│  │  │  ├─ tray.ts              Tray icon + context menu
│  │  │  └─ icon.ts              Icon resolution (with synthetic PNG fallback)
│  │  └─ ipc/
│  │     └─ handlers.ts          `ipcMain.handle(...)` registrations
│  ├─ preload/
│  │  └─ index.ts                contextBridge surface exposed as `window.uploader`
│  ├─ renderer/                  Browser-side UI (separate ESM compile)
│  │  ├─ index.html
│  │  ├─ styles.css
│  │  ├─ types.ts                Type mirrors of the preload surface
│  │  └─ renderer.ts             DOM wiring for the setup window
│  └─ shared/
│     └─ types.ts                Types that cross IPC boundaries
├─ tsconfig.json                 main + preload + shared
├─ tsconfig.renderer.json        Renderer-only (separate rootDir/outDir)
└─ package.json
```

### Architecture

The main process is composed of a handful of small, single-responsibility modules wired together in `src/main/index.ts`:

- **`Logger`** owns a bounded log buffer and fans new entries out to subscribers (the renderer subscribes via IPC).
- **`AuthController`** orchestrates sign-in / sign-out / refresh, holds the active token, and emits state changes to anyone who calls `onChange(...)`. It delegates the loopback OAuth flow to `auth/oauth.ts` and disk persistence to `auth/storage.ts`.
- **`SaveWatcher`** discovers Steam profile save directories under `%APPDATA%\SlayTheSpire2`, watches each for `current_run.save` writes, and uploads on change with a short debounce.
- **`WindowManager`** and **`TrayManager`** encapsulate the `BrowserWindow` and `Tray` lifecycles respectively.
- **`registerIpcHandlers`** wires `ipcMain.handle(...)` channels that match the methods exposed in `src/preload/index.ts`.

Everything ultimately funnels through `src/main/index.ts`, which is intentionally short — it constructs the components, connects their events, and handles `app` lifecycle hooks.

## License

[MIT](./LICENSE)
