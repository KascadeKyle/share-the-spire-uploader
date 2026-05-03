import type { AuthState, LogEntry, UploaderSettings } from "./types";

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

window.uploader.onAuthChanged(renderAuthState);
window.uploader.onSettingsChanged(renderSettings);
window.uploader.onLogAppend(appendLogLine);

void (async () => {
  const [state, settings, buffer] = await Promise.all([
    window.uploader.getAuthState(),
    window.uploader.getSettings(),
    window.uploader.getLogBuffer(),
  ]);
  renderAuthState(state);
  renderSettings(settings);
  for (const entry of buffer) appendLogLine(entry);
})();

export {};
