import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "./session";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";
type SessionContextValue = {
  data: Session | null;
  status: SessionStatus;
  update: (data?: unknown) => Promise<Session | null>;
};
const SessionContext = createContext<SessionContextValue | null>(null);
const SESSION_EVENT = "holoplax-session-changed";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf");
  if (!response.ok) throw new Error("Failed to load authentication token");
  return (await response.json()).csrfToken;
}

export async function signIn(provider: string, options: Record<string, unknown> = {}) {
  const { callbackUrl = window.location.href, redirect = true, ...credentials } = options;
  const response = await fetch(
    `/api/auth/${provider === "credentials" ? "callback" : "signin"}/${encodeURIComponent(provider)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
      },
      body: new URLSearchParams({
        ...Object.fromEntries(Object.entries(credentials).map(([k, v]) => [k, String(v)])),
        csrfToken: await csrfToken(),
        callbackUrl: String(callbackUrl),
      }),
    },
  );
  const data = await response.json();
  const url = new URL(data.url ?? String(callbackUrl), window.location.origin);
  const error = url.searchParams.get("error");
  window.dispatchEvent(new Event(SESSION_EVENT));
  if (redirect) window.location.assign(url);
  return {
    error,
    status: response.status,
    ok: response.ok && !error,
    url: error ? null : url.href,
  };
}

export async function signOut() {
  const response = await fetch("/api/auth/signout", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken: await csrfToken(), callbackUrl: "/auth/signin" }),
  });
  if (!response.ok) throw new Error("Failed to sign out");
  const data = await response.json();
  window.dispatchEvent(new Event(SESSION_EVENT));
  window.location.assign(data.url ?? "/auth/signin");
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const update = useCallback(async (next?: unknown) => {
    const response = await fetch(
      "/api/auth/session",
      next === undefined
        ? undefined
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ csrfToken: await csrfToken(), data: next }),
          },
    );
    if (!response.ok) throw new Error("Failed to load session");
    const session: Session | null = await response.json();
    setData(session);
    setStatus(session?.user ? "authenticated" : "unauthenticated");
    return session;
  }, []);
  useEffect(() => {
    const refresh = () => {
      void update().catch(() => {
        setData(null);
        setStatus("unauthenticated");
      });
    };
    refresh();
    window.addEventListener(SESSION_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(SESSION_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [update]);
  return (
    <SessionContext.Provider value={{ data, status, update }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession requires SessionProvider");
  return session;
}
