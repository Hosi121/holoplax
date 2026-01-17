"use client";

import { create } from "zustand";

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
        set({ workspaceId: id });
        await fetch("/api/workspaces/current", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId: id }),
        });
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
