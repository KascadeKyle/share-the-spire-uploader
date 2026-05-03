import { promises as fs } from "node:fs";
import * as path from "node:path";

import { API_URL } from "../config";
import type { ApiUser } from "../../shared/types";

/** Successful upload response from `/api/uploadSave`. */
export type UploadSaveResult = {
  ok: true;
  save: unknown;
};

/** Thrown for non-2xx responses. The HTTP `status` is preserved for callers. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** GET `/api/me` — returns the user record or `null` if no session. */
export async function getMe(token: string): Promise<ApiUser | null> {
  const res = await apiFetch(token, "/api/me");
  if (!res.ok) {
    throw new ApiError(`GET /api/me failed: ${res.status}`, res.status);
  }
  const data = (await res.json()) as { user: ApiUser | null };
  return data.user;
}

/**
 * Read `filePath` from disk and POST it to `/api/uploadSave` as
 * `multipart/form-data` under the field name `current_run.save` (matching the
 * API's expected form field).
 */
export async function uploadSave(
  token: string,
  filePath: string,
): Promise<UploadSaveResult> {
  const buf = await fs.readFile(filePath);

  // Copy into a fresh ArrayBuffer so the Blob owns a contiguous, non-shared
  // buffer (Node's Buffer can be backed by a pooled SharedArrayBuffer view).
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);

  const form = new FormData();
  const blob = new Blob([ab], { type: "application/octet-stream" });
  form.append("current_run.save", blob, path.basename(filePath));

  const res = await apiFetch(token, "/api/uploadSave", { method: "POST", body: form });
  if (!res.ok) {
    const detail = await safeText(res);
    throw new ApiError(
      `POST /api/uploadSave failed: ${res.status}${detail ? ` ${detail}` : ""}`,
      res.status,
    );
  }
  return (await res.json()) as UploadSaveResult;
}

/**
 * Best-effort logout. The API will revoke the underlying session row when
 * called with the cookie set; for bearer-token equivalence we drop the token
 * locally regardless. Even if the row lingers, it can no longer be used
 * because the token is gone from this device.
 */
export async function logout(token: string): Promise<void> {
  await apiFetch(token, "/api/auth/logout", { method: "POST" }).catch(() => {
    /* ignore — local token clear is the source of truth */
  });
}

/** Make a request against `API_URL`, automatically adding the bearer token. */
async function apiFetch(
  token: string | null,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = new URL(path, API_URL);
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url.toString(), { ...init, headers });
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
