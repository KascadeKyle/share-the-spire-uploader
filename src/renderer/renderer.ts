import type {
  AuthState,
  LogEntry,
  UpdateStatus,
  UploaderSettings,
} from "./types";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

const sections = {
  status: $("status"),
  signedOut: $("signed-out"),
  signedIn: $("signed-in"),
  error: $("error-state"),
} as const;

type SectionKey = keyof typeof sections;

const avatarEl = $<HTMLImageElement>("avatar");
const errorEl = $("error-message");
const profileLinkEl = $<HTMLAnchorElement>("profile-link");
const signInBtn = $<HTMLButtonElement>("sign-in-btn");
const signOutBtn = $<HTMLButtonElement>("sign-out-btn");
const retryBtn = $<HTMLButtonElement>("retry-btn");
const openAtLoginEl = $<HTMLInputElement>("open-at-login");
const autoInstallEl = $<HTMLInputElement>("auto-install-updates");
const updateBannerEl = $("update-banner");
const updateBannerTitleEl = $("update-banner-title");
const updateBannerMessageEl = $("update-banner-message");
const updateInstallBtn = $<HTMLButtonElement>("update-install-btn");
const logBoxEl = $("log-box");
const statusMessageEl = sections.status.querySelector("p");

function showSection(which: SectionKey): void {
  for (const key of Object.keys(sections) as SectionKey[]) {
    sections[key].hidden = key !== which;
  }
}

function renderAuthState(state: AuthState): void {
  switch (state.status) {
    case "signed-out":
      showSection("signedOut");
      signInBtn.disabled = false;
      signInBtn.textContent = "Sign in with Discord";
      break;
    case "signed-in":
      showSection("signedIn");
      if (state.user.avatar_url) {
        avatarEl.src = state.user.avatar_url;
        avatarEl.hidden = false;
      } else {
        avatarEl.hidden = true;
        avatarEl.removeAttribute("src");
      }
      break;
    case "error":
      showSection("error");
      errorEl.textContent = state.message;
      break;
  }
}

function renderSettings(settings: UploaderSettings): void {
  openAtLoginEl.checked = settings.openAtLoginHidden;
  autoInstallEl.checked = settings.autoInstallUpdates;
}

function renderUpdateStatus(status: UpdateStatus): void {
  switch (status.kind) {
    case "idle":
      updateBannerEl.hidden = true;
      break;
    case "downloading":
      updateBannerEl.hidden = false;
      updateBannerTitleEl.textContent = `Downloading update ${status.version}…`;
      updateBannerMessageEl.textContent = `${status.percent}% complete`;
      updateInstallBtn.hidden = true;
      break;
    case "ready":
      updateBannerEl.hidden = false;
      updateBannerTitleEl.textContent = `Update ready: v${status.version}`;
      updateBannerMessageEl.textContent =
        "Install now to apply, or it will install next time you quit if enabled.";
      updateInstallBtn.hidden = false;
      updateInstallBtn.disabled = false;
      updateInstallBtn.textContent = "Install and restart";
      break;
  }
}

function appendLogLine(entry: LogEntry): void {
  const line = document.createElement("div");
  line.className = "log-line";

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = formatTime(entry.ts);

  const msg = document.createElement("span");
  msg.className = "log-msg";
  msg.textContent = entry.message;

  line.append(time, document.createTextNode(" "), msg);
  logBoxEl.appendChild(line);
  logBoxEl.scrollTop = logBoxEl.scrollHeight;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

signInBtn.addEventListener("click", async () => {
  signInBtn.disabled = true;
  signInBtn.textContent = "Waiting for browser sign-in…";
  showSection("status");
  if (statusMessageEl) {
    statusMessageEl.textContent = "Complete sign-in in your browser…";
  }
  const state = await window.uploader.signIn();
  renderAuthState(state);
});

signOutBtn.addEventListener("click", async () => {
  signOutBtn.disabled = true;
  try {
    const state = await window.uploader.signOut();
    renderAuthState(state);
  } finally {
    signOutBtn.disabled = false;
  }
});

retryBtn.addEventListener("click", async () => {
  showSection("status");
  const state = await window.uploader.getAuthState();
  renderAuthState(state);
});

profileLinkEl.addEventListener("click", (e) => {
  e.preventDefault();
  void window.uploader.openProfile();
});

openAtLoginEl.addEventListener("change", async () => {
  openAtLoginEl.disabled = true;
  try {
    const settings = await window.uploader.setOpenAtLoginHidden(
      openAtLoginEl.checked,
    );
    renderSettings(settings);
  } finally {
    openAtLoginEl.disabled = false;
  }
});

autoInstallEl.addEventListener("change", async () => {
  autoInstallEl.disabled = true;
  try {
    const settings = await window.uploader.setAutoInstallUpdates(
      autoInstallEl.checked,
    );
    renderSettings(settings);
  } finally {
    autoInstallEl.disabled = false;
  }
});

updateInstallBtn.addEventListener("click", async () => {
  updateInstallBtn.disabled = true;
  updateInstallBtn.textContent = "Restarting…";
  try {
    await window.uploader.installUpdate();
  } finally {
    // If we're still alive a moment later the install didn't take — reset
    // so the user isn't stuck looking at a permanent "Restarting…" button.
    setTimeout(() => {
      updateInstallBtn.disabled = false;
      updateInstallBtn.textContent = "Install and restart";
    }, 2000);
  }
});

window.uploader.onAuthChanged(renderAuthState);
window.uploader.onSettingsChanged(renderSettings);
window.uploader.onLogAppend(appendLogLine);
window.uploader.onUpdateStatusChanged(renderUpdateStatus);

void (async () => {
  const [state, settings, buffer, updateStatus] = await Promise.all([
    window.uploader.getAuthState(),
    window.uploader.getSettings(),
    window.uploader.getLogBuffer(),
    window.uploader.getUpdateStatus(),
  ]);
  renderAuthState(state);
  renderSettings(settings);
  for (const entry of buffer) appendLogLine(entry);
  renderUpdateStatus(updateStatus);
})();

export {};
