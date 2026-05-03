import { shell } from "electron";
import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import { FRONTEND_URL } from "../config";
import { saveAuth, type StoredAuth } from "./storage";

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_PAGE_HTML =
  '<!doctype html><meta charset="utf-8"><title>Connected</title>' +
  "<style>body{font-family:system-ui,sans-serif;padding:48px;color:#222}</style>" +
  "<h1>Uploader connected</h1>" +
  "<p>You can close this tab and return to the desktop app.</p>";

/**
 * Run the loopback OAuth flow and persist the resulting token:
 *   1. spin up a local HTTP server on 127.0.0.1:<random>
 *   2. open the user's default browser to `<frontend>/uploader/auth?...`
 *   3. wait for `/callback?state=...&token=...` (state must match)
 *   4. write the token via `storage.saveAuth(...)` and return it.
 */
export async function signIn(): Promise<StoredAuth> {
  const state = randomUUID();
  const { server, port } = await startLoopbackServer();

  const tokenPromise = waitForToken({ server, state });

  const redirect = `http://127.0.0.1:${port}/callback`;
  const authUrl = new URL("/uploader/auth", FRONTEND_URL);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("redirect", redirect);

  await shell.openExternal(authUrl.toString());

  const token = await tokenPromise;
  const stored: StoredAuth = { token, saved_at: Date.now() };
  await saveAuth(stored);
  return stored;
}

/** Bind a one-shot HTTP server to a random port on the loopback interface. */
function startLoopbackServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Failed to bind loopback server"));
        return;
      }
      resolve({ server, port: addr.port });
    });
  });
}

/**
 * Resolve when the loopback server receives a valid `/callback` whose state
 * matches `state`, with the token from the query string.
 *
 * Rejects if the OAuth flow takes longer than `LOGIN_TIMEOUT_MS`. The server
 * is closed in either outcome.
 */
function waitForToken(opts: { server: Server; state: string }): Promise<string> {
  const { server, state } = opts;

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Sign-in timed out. Please try again."));
    }, LOGIN_TIMEOUT_MS);

    const cleanup = (): void => {
      clearTimeout(timer);
      server.off("request", onRequest);
      server.close();
    };

    const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
      try {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${addressPort(server)}`);

        if (url.pathname !== "/callback") {
          respond(res, 404, "Not found");
          return;
        }

        const gotState = url.searchParams.get("state");
        const gotToken = url.searchParams.get("token");

        if (!gotState || !gotToken) {
          respond(res, 400, "Missing token or state.");
          return;
        }
        if (gotState !== state) {
          respond(res, 400, "State mismatch.");
          return;
        }

        respond(res, 200, SUCCESS_PAGE_HTML, "text/html; charset=utf-8");
        cleanup();
        resolve(gotToken);
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    server.on("request", onRequest);
  });
}

function addressPort(server: Server): number {
  const addr = server.address();
  if (!addr || typeof addr === "string") return 0;
  return addr.port;
}

function respond(
  res: ServerResponse,
  status: number,
  body: string,
  contentType = "text/plain; charset=utf-8",
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.end(body);
}
