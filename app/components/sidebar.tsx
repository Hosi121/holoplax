"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  Users,
  Zap,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export const navItems = [
  { label: "ダッシュボード", href: "/", icon: LayoutDashboard },
  { label: "バックログ", href: "/backlog", icon: Inbox },
  { label: "スプリント", href: "/sprint", icon: KanbanSquare },
  { label: "カンバン", href: "/kanban", icon: KanbanSquare },
  { label: "ワークスペース", href: "/workspaces", icon: Users },
  { label: "ベロシティ", href: "/velocity", icon: BarChart3 },
  { label: "自動化", href: "/automation", icon: Zap },
  { label: "設定", href: "/settings", icon: Settings },
  { label: "ユーザー管理", href: "/admin/users", icon: Users, adminOnly: true },
  { label: "監査ログ", href: "/admin/audit", icon: BarChart3, adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<
    { id: string; name: string; role: string }[]
  >([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    null,
  );
  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  const loadWorkspaces = useCallback(() => {
    if (!session?.user) return () => undefined;
    let active = true;
    setWorkspaceLoading(true);
    fetch("/api/workspaces/current")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setWorkspaces(data.workspaces ?? []);
        setCurrentWorkspaceId(data.currentWorkspaceId ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setWorkspaceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => loadWorkspaces(), [loadWorkspaces]);

  useEffect(() => {
    if (!session?.user) return;
    const handler = () => {
      loadWorkspaces();
    };
    window.addEventListener("workspace:changed", handler);
    return () => {
      window.removeEventListener("workspace:changed", handler);
    };
  }, [loadWorkspaces, session?.user]);
  return (
    <aside className="sticky top-0 hidden min-h-screen w-60 flex-col border border-slate-200 bg-white p-4 shadow-sm lg:flex">
      <div className="border-b border-slate-200 pb-4">
        <Image
          src="/logo_holoplax.webp"
          alt="Holoplax logo"
          width={180}
          height={56}
          className="h-auto"
          style={{ width: "100%", height: "auto" }}
          priority
        />
      </div>
      {session?.user ? (
        <div className="mt-4 border-b border-slate-200 pb-4">
          <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
            Workspace
          </div>
          {workspaceLoading ? (
            <div className="text-xs text-slate-500">読み込み中...</div>
          ) : workspaces.length > 0 ? (
            <div className="grid gap-2">
              <select
                value={currentWorkspaceId ?? ""}
                onChange={async (event) => {
                  const nextId = event.target.value;
                  setCurrentWorkspaceId(nextId);
                  await fetch("/api/workspaces/current", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ workspaceId: nextId }),
                  });
                  window.dispatchEvent(
                    new CustomEvent("workspace:changed", {
                      detail: { workspaceId: nextId },
                    }),
                  );
                  router.refresh();
                }}
                className="border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <Link
                href="/workspaces"
                className="border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] text-slate-600 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
              >
                管理
              </Link>
            </div>
          ) : (
            <Link
              href="/workspaces"
              className="border border-slate-200 bg-white px-3 py-2 text-center text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            >
              ワークスペースを作成
            </Link>
          )}
        </div>
      ) : null}
      <nav className="mt-4 flex flex-col gap-1">
        {navItems
          .filter((item) => !item.adminOnly || session?.user?.role === "ADMIN")
          .map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-2 border px-3 py-2 text-sm transition hover:border-[#2323eb]/40 hover:bg-[#2323eb]/10 hover:text-[#2323eb] ${
                pathname === item.href
                  ? "border-[#2323eb]/40 bg-[#2323eb]/10 text-[#2323eb]"
                  : "border-transparent text-slate-700"
              }`}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </Link>
          ))}
      </nav>
      <div className="mt-auto border-t border-slate-200 pt-4 text-xs text-slate-600">
        {status === "loading" ? (
          <div className="text-[11px] text-slate-500">読み込み中...</div>
        ) : session?.user ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Account
              </div>
              <Link
                href="/settings#account"
                className="text-slate-400 transition hover:text-[#2323eb]"
                aria-label="アカウント設定"
              >
                <Settings size={14} />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name ?? session.user.email ?? "User"}
                  className="h-10 w-10 border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-600">
                  {(session.user.name ?? session.user.email ?? "U").slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {session.user.name ?? "ユーザー"}
                </div>
                <div className="truncate text-xs text-slate-600">
                  {session.user.email ?? "email@example.com"}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Link
            href="/auth/signin"
            className="block w-full border border-slate-200 bg-white px-3 py-2 text-center text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
          >
            ログイン
          </Link>
        )}
      </div>
    </aside>
  );
}
