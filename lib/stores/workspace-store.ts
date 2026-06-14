"use client";

import { create } from "zustand";
import { apiFetch } from "../api-client";

export interface Workspace {
  id: string;
  name: string;
  role: string;
}

interface WorkspaceState {
  workspaceId: string | null;
  workspaces: Workspace[];
  loading: boolean;
  ready: boolean;
}

interface WorkspaceActions {
  setWorkspaceId: (id: string) => Promise<void>;
  fetchWorkspaces: () => Promise<void>;
  initialize: () => Promise<void>;
}

type WorkspaceStore = WorkspaceState & WorkspaceActions;

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaceId: null,
  workspaces: [],
  loading: false,
  ready: false,

  setWorkspaceId: async (id: string) => {
    const previous = get().workspaceId;
    set({ workspaceId: id });
    // Must go through apiFetch so the CSRF header is attached — a raw fetch is
    // rejected with 403 by the proxy, which would leave the server-side current
    // workspace out of sync with the optimistic local state.
    try {
      const res = await apiFetch("/api/workspaces/current", {
        method: "POST",
        body: JSON.stringify({ workspaceId: id }),
      });
      if (!res.ok) {
        // Revert optimistic update on failure so the UI reflects reality.
        set({ workspaceId: previous });
        throw new Error(`failed to switch workspace (${res.status})`);
      }
    } catch (error) {
      set({ workspaceId: previous });
      throw error;
    }
  },

  fetchWorkspaces: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/workspaces/current");
      if (!res.ok) {
        set({ loading: false, ready: true });
        return;
      }
      const data = await res.json();
      set({
        workspaces: data.workspaces ?? [],
        workspaceId: data.currentWorkspaceId ?? null,
        loading: false,
        ready: true,
      });
    } catch {
      set({ loading: false, ready: true });
    }
  },

  initialize: async () => {
    if (get().ready) return;
    await get().fetchWorkspaces();
  },
}));
