"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "../../lib/stores/workspace-store";

export function useWorkspaceId() {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const ready = useWorkspaceStore((state) => state.ready);
  const initialize = useWorkspaceStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return { workspaceId, ready };
}
