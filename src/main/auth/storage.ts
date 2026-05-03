import { app } from "electron";
import { promises as fs } from "node:fs";
import * as path from "node:path";

const AUTH_FILE = "auth.json";

/** Shape of the persisted auth file. */
export type StoredAuth = {
  token: string;
  saved_at: number;
};

/** Read the persisted auth file, or `null` if there isn't one yet. */
export async function loadAuth(): Promise<StoredAuth | null> {
  try {
    const buf = await fs.readFile(authFilePath(), "utf8");
    const parsed = JSON.parse(buf) as StoredAuth;
    if (typeof parsed.token === "string" && parsed.token.length > 0) {
      return parsed;
    }
    return null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Write the given auth record to the user-data folder. */
export async function saveAuth(auth: StoredAuth): Promise<void> {
  const file = authFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(auth, null, 2), "utf8");
}

/** Delete the persisted auth file, if present. Idempotent. */
export async function clearAuth(): Promise<void> {
  try {
    await fs.unlink(authFilePath());
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

function authFilePath(): string {
  return path.join(app.getPath("userData"), AUTH_FILE);
}

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}
