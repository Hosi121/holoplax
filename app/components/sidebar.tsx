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
import type { LucideIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { memo, useEffect } from "react";
import { useWorkspaceStore } from "../../lib/stores/workspace-store";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  tooltip: string;
  adminOnly?: boolean;
};

const navSections: {
  heading: string;
  description?: string;
  items: NavItem[];
}[] = [
  {
    heading: "タスク管理",
    description: "やるべきこと・スプリント中の対応・レビュー用の一覧",
    items: [
      { label: "バックログ", href: "/backlog", icon: Inbox, tooltip: "TODOを整理して次に着手する候補を決める" },
      { label: "スプリント", href: "/sprint", icon: KanbanSquare, tooltip: "今週のスプリントと容量管理" },
      { label: "カンバン", href: "/kanban", icon: KanbanSquare, tooltip: "ステータスをドラッグして進捗を動かす" },
      { label: "レビュー", href: "/review", icon: LayoutDashboard, tooltip: "ベロシティや完了タスクを振り返る" },
    ],
  },
  {
    heading: "ワークスペースと分析",
    description: "チーム/メンバー周りの管理や履歴観察",
    items: [
      { label: "ワークスペース", href: "/workspaces", icon: Users, tooltip: "参加中ワークスペースを管理" },
      { label: "ベロシティ", href: "/velocity", icon: BarChart3, tooltip: "過去スプリントのベロシティを確認" },
    ],
  },
  {
    heading: "自動化",
    description: "AIによる委任・分解・サポートを制御",
    items: [
      { label: "自動化", href: "/automation", icon: Zap, tooltip: "スコアに応じた自動化ポリシーを見る" },
    ],
  },
  {
    heading: "設定",
    description: "認証・権限・AI設定",
    items: [
      { label: "設定", href: "/settings", icon: Settings, tooltip: "個人設定や認証状態を確認" },
      { label: "ユーザー管理", href: "/admin/users", icon: Users, tooltip: "管理者向けにユーザーを管理", adminOnly: true },
      { label: "監査ログ", href: "/admin/audit", icon: BarChart3, tooltip: "アクション履歴を確認", adminOnly: true },
      { label: "AI設定", href: "/admin/ai", icon: Zap, tooltip: "AI接続/モデル設定", adminOnly: true },
    ],
  },
];


const NavigationLinks = memo(function NavigationLinks({
  pathname,
  isAdmin,
}: {
  pathname: string;
  isAdmin: boolean;
}) {
  return (
    <nav className="mt-4 flex flex-col gap-1">
      {navSections.map((section) => (
        <div key={section.heading} className="space-y-1 border-b border-slate-200 pb-3 last:border-none last:pb-0">
          <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
            {section.heading}
          </div>
          {section.description ? (
            <p className="text-[11px] text-slate-500">{section.description}</p>
          ) : null}
          <div className="mt-1 flex flex-col gap-1">
            {section.items
              .filter((item) => !item.adminOnly || isAdmin)
              .map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  title={item.tooltip}
                  className={`flex items-center gap-2 border px-3 py-2 text-sm transition hover:border-[#2323eb]/40 hover:bg-[#2323eb]/10 hover:text-[#2323eb] ${pathname === item.href
                    ? "border-[#2323eb]/40 bg-[#2323eb]/10 text-[#2323eb]"
                    : "border-transparent text-slate-700"
                    }`}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </Link>
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
});

const AccountSection = memo(function AccountSection({
  session,
  status,
}: {
  session: ReturnType<typeof useSession>["data"];
  status: ReturnType<typeof useSession>["status"];
}) {
  return (
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
  );
});


function WorkspaceSelector() {
  const router = useRouter();
  const { data: session } = useSession();

  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const loading = useWorkspaceStore((state) => state.loading);
  const setWorkspaceId = useWorkspaceStore((state) => state.setWorkspaceId);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);

  useEffect(() => {
    if (session?.user) {
      void fetchWorkspaces();
    }
  }, [session?.user, fetchWorkspaces]);

  if (!session?.user) return null;

  return (
    <div className="mt-4 border-b border-slate-200 pb-4">
      <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
        Workspace
      </div>
      {loading ? (
        <div className="text-xs text-slate-500">読み込み中...</div>
      ) : workspaces.length > 0 ? (
        <div className="grid gap-2">
          <select
            value={workspaceId ?? ""}
            onChange={async (event) => {
              const nextId = event.target.value;
              await setWorkspaceId(nextId);
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
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  return (
    <>
      <div className="hidden w-60 lg:block" aria-hidden />
      <aside className="fixed left-0 top-0 hidden h-screen w-60 flex-col border border-slate-200 bg-white p-4 shadow-sm lg:flex">
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
        <WorkspaceSelector />
        <NavigationLinks
          pathname={pathname}
          isAdmin={session?.user?.role === "ADMIN"}
        />
        <AccountSection session={session} status={status} />
      </aside>
    </>
  );
}
