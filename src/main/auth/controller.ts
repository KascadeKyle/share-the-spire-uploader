import { ApiError, getMe, logout } from "../api/client";
import type { Logger } from "../logger";
import type { AuthState } from "../../shared/types";
import { signIn } from "./oauth";
import { clearAuth, loadAuth, type StoredAuth } from "./storage";

type ChangeListener = (state: AuthState) => void | Promise<void>;

/**
 * Coordinates everything related to the user's auth state:
 * - persistence of the stored token (delegated to `./storage`)
 * - the loopback OAuth flow (delegated to `./oauth`)
 * - validating the token against the API (delegated to `../api/client`)
 * - notifying subscribers when the state changes
 *
 * Holds the active token in-memory; consumers read it via `token()`.
 */
export class AuthController {
  private current: StoredAuth | null = null;
  private lastState: AuthState = { status: "signed-out" };
  private readonly listeners = new Set<ChangeListener>();

  constructor(private readonly logger: Logger) {}

  /** Bearer token for outgoing API calls, or `null` when signed out. */
  token(): string | null {
    return this.current?.token ?? null;
  }

  /** Last broadcast auth state (cached, not refetched). */
  state(): AuthState {
    return this.lastState;
  }

  /** Subscribe to state changes; returns an unsubscribe function. */
  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Load any persisted token from disk into memory. Call once at startup. */
  async hydrate(): Promise<void> {
    this.current = await loadAuth();
  }

  /**
   * Validate the current token against the API and notify subscribers.
   * On 401, clears the token automatically. Other errors surface as
   * `{ status: "error" }` so the UI can show a retry affordance.
   */
  async refresh(): Promise<AuthState> {
    return this.commit(await this.resolveState());
  }

  /** Run the loopback OAuth flow and persist the resulting token. */
  async signIn(): Promise<AuthState> {
    try {
      this.logger.append("Sign-in flow started.");
      this.current = await signIn();
      const state = await this.resolveState();
      if (state.status === "signed-in") {
        this.logger.append(`Signed in as ${state.user.id}.`);
      }
      return await this.commit(state);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.append(`Sign-in failed: ${message}`);
      return this.commit({ status: "error", message });
    }
  }

  /** Revoke the current session (best effort) and clear the local token. */
  async signOut(): Promise<AuthState> {
    if (this.current) {
      await logout(this.current.token);
    }
    this.current = null;
    await clearAuth();
    this.logger.append("Signed out.");
    return this.commit({ status: "signed-out" });
  }

  private async resolveState(): Promise<AuthState> {
    if (!this.current) return { status: "signed-out" };
    try {
      const user = await getMe(this.current.token);
      if (!user) {
        this.current = null;
        await clearAuth();
        return { status: "signed-out" };
      }
      return { status: "signed-in", user };
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        this.current = null;
        await clearAuth();
        return { status: "signed-out" };
      }
      return {
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async commit(state: AuthState): Promise<AuthState> {
    this.lastState = state;
    for (const listener of this.listeners) {
      await listener(state);
    }
    return state;
  }
}
