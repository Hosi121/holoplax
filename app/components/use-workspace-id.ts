"use client";

import { useEffect, useState } from "react";

type WorkspaceEvent = CustomEvent<{ workspaceId: string }>;

export function useWorkspaceId() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/workspaces/current")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        setWorkspaceId(data?.currentWorkspaceId ?? null);
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as WorkspaceEvent).detail;
      if (detail?.workspaceId) {
        setWorkspaceId(detail.workspaceId);
      }
    };
    window.addEventListener("workspace:changed", handler);
    return () => {
      window.removeEventListener("workspace:changed", handler);
    };
  }, []);

  return { workspaceId, ready };
}
