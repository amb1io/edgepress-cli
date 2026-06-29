import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type StoredCredential = {
  session_token: string;
  expires_at: string;
  email: string;
};

export type CredentialsStore = Record<string, StoredCredential>;

const CREDENTIALS_DIR = path.join(os.homedir(), ".edgepress");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.json");

export function normalizeSiteOrigin(input: string): string {
  const url = new URL(input.trim());
  return url.origin.replace(/\/$/, "");
}

function readStore(): CredentialsStore {
  if (!fs.existsSync(CREDENTIALS_FILE)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8")) as CredentialsStore;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeStore(store: CredentialsStore): void {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function getStoredCredential(siteOrigin: string): StoredCredential | null {
  const store = readStore();
  const cred = store[siteOrigin];
  if (!cred?.session_token) return null;

  if (cred.expires_at) {
    const expires = Date.parse(cred.expires_at);
    if (Number.isFinite(expires) && expires <= Date.now()) {
      return null;
    }
  }

  return cred;
}

export function saveCredential(
  siteOrigin: string,
  cred: StoredCredential,
): void {
  const store = readStore();
  store[siteOrigin] = cred;
  writeStore(store);
}

export function clearCredential(siteOrigin: string): void {
  const store = readStore();
  delete store[siteOrigin];
  writeStore(store);
}

export function cookieHeaderFromToken(sessionToken: string): string {
  return `better-auth.session_token=${sessionToken}`;
}

export function parseSessionTokenFromSetCookie(setCookieHeaders: string[]): string | null {
  for (const header of setCookieHeaders) {
    const match = header.match(/better-auth\.session_token=([^;]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

export function parseSessionExpiryFromSetCookie(setCookieHeaders: string[]): string | null {
  for (const header of setCookieHeaders) {
    const match = header.match(/Expires=([^;]+)/i);
    if (match?.[1]) {
      const date = new Date(match[1]);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
    const maxAge = header.match(/Max-Age=(\d+)/i)?.[1];
    if (maxAge) {
      const seconds = parseInt(maxAge, 10);
      if (Number.isFinite(seconds)) {
        return new Date(Date.now() + seconds * 1000).toISOString();
      }
    }
  }
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}
