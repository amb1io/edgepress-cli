import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  clearCredential,
  cookieHeaderFromToken,
  getStoredCredential,
  normalizeSiteOrigin,
  parseSessionExpiryFromSetCookie,
  parseSessionTokenFromSetCookie,
  saveCredential,
} from "../auth/credentials.ts";

export type AuthenticatedClient = {
  origin: string;
  cookieHeader: string;
  email: string;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

async function promptHidden(prompt: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

async function loginWithCredentials(
  origin: string,
  email: string,
  password: string,
): Promise<{ sessionToken: string; expiresAt: string }> {
  const response = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      callbackURL: "/",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Login failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  const sessionToken = parseSessionTokenFromSetCookie(setCookies);
  if (!sessionToken) {
    throw new Error("Login succeeded but no session cookie was returned");
  }

  return {
    sessionToken,
    expiresAt: parseSessionExpiryFromSetCookie(setCookies) ?? new Date(Date.now() + 7 * 86400000).toISOString(),
  };
}

export async function authenticateSite(
  siteUrl: string,
  options?: { email?: string; password?: string; force?: boolean },
): Promise<AuthenticatedClient> {
  const origin = normalizeSiteOrigin(siteUrl);

  if (!options?.force) {
    const stored = getStoredCredential(origin);
    if (stored) {
      return createClient(origin, stored.session_token, stored.email);
    }
  }

  let email = options?.email?.trim() ?? "";
  let password = options?.password ?? "";

  if (!email) {
    email = await promptHidden(`Email for ${origin}: `);
  }
  if (!password) {
    password = await promptHidden("Password: ");
  }

  const { sessionToken, expiresAt } = await loginWithCredentials(origin, email, password);

  saveCredential(origin, {
    session_token: sessionToken,
    expires_at: expiresAt,
    email,
  });

  console.log(`[edgepress] Authenticated with ${origin} as ${email}`);
  return createClient(origin, sessionToken, email);
}

function createClient(
  origin: string,
  sessionToken: string,
  email: string,
): AuthenticatedClient {
  const cookieHeader = cookieHeaderFromToken(sessionToken);

  const fetchWithAuth = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const url = path.startsWith("http") ? path : `${origin}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(init.headers);
    headers.set("Cookie", cookieHeader);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    let response = await fetch(url, { ...init, headers });

    if (response.status === 401) {
      clearCredential(origin);
      throw new Error("Session expired. Run again to re-authenticate.");
    }

    return response;
  };

  return {
    origin,
    cookieHeader,
    email,
    fetch: fetchWithAuth,
  };
}

export async function fetchJson<T>(
  client: AuthenticatedClient,
  path: string,
): Promise<T> {
  const response = await client.fetch(path);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`API ${path} failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return (await response.json()) as T;
}
