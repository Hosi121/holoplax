"use client";

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  Users,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { memo, useEffect } from "react";
import { useWorkspaceStore } from "../../lib/stores/workspace-store";
import { ThemeToggle } from "./theme-toggle";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  tooltip: string;
  adminOnly?: boolean;
};

const navSections: {
  heading: string;
  items: NavItem[];
}[] = [
  {
    heading: "タスク管理",
    items: [
      {
        label: "レビュー",
        href: "/review",
        icon: LayoutDashboard,
        tooltip: "ベロシティや完了タスクを振り返る",
      },
      {
        label: "バックログ",
        href: "/backlog",
        icon: Inbox,
        tooltip: "TODOを整理して次に着手する候補を決める",
      },
      {
        label: "スプリント",
        href: "/sprint",
        icon: KanbanSquare,
        tooltip: "今週のスプリントと容量管理",
      },
      {
        label: "カンバン",
        href: "/kanban",
        icon: KanbanSquare,
        tooltip: "ステータスをドラッグして進捗を動かす",
      },
    ],
  },
  {
    heading: "ワークスペースと分析",
    items: [
      {
        label: "ワークスペース",
        href: "/workspaces",
        icon: Users,
        tooltip: "参加中ワークスペースを管理",
      },
      {
        label: "ベロシティ",
        href: "/velocity",
        icon: BarChart3,
        tooltip: "過去スプリントのベロシティを確認",
      },
    ],
  },
  {
    heading: "自動化",
    items: [
      {
        label: "自動化",
        href: "/automation",
        icon: Zap,
        tooltip: "スコアに応じた自動化ポリシーを見る",
      },
    ],
  },
  {
    heading: "設定",
    items: [
      { label: "設定", href: "/settings", icon: Settings, tooltip: "個人設定や認証状態を確認" },
      {
        label: "ユーザー管理",
        href: "/admin/users",
        icon: Users,
        tooltip: "管理者向けにユーザーを管理",
        adminOnly: true,
      },
      {
        label: "監査ログ",
        href: "/admin/audit",
        icon: BarChart3,
        tooltip: "アクション履歴を確認",
        adminOnly: true,
      },
      {
        label: "AI設定",
        href: "/admin/ai",
        icon: Zap,
        tooltip: "AI接続/モデル設定",
        adminOnly: true,
      },
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
        <div
          key={section.heading}
          className="space-y-1 border-b border-[var(--border)] pb-3 last:border-none last:pb-0"
        >
          <div className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
            {section.heading}
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {section.items
              .filter((item) => !item.adminOnly || isAdmin)
              .map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  title={item.tooltip}
                  className={`flex items-center gap-2 border px-3 py-2 text-sm transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] ${
                    pathname === item.href
                      ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-transparent text-[var(--text-secondary)]"
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
    <div className="border-t border-[var(--border)] pt-4 text-xs text-[var(--text-secondary)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Theme
        </span>
        <ThemeToggle />
      </div>
      {status === "loading" ? (
        <div className="text-[11px] text-[var(--text-muted)]">読み込み中...</div>
      ) : session?.user ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Account
            </div>
            <Link
              href="/settings#account"
              className="text-[var(--text-muted)] transition hover:text-[var(--accent)]"
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
                className="h-10 w-10 border border-[var(--border)] object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center border border-[var(--border)] bg-[var(--muted)] text-sm font-semibold text-[var(--text-secondary)]">
                {(session.user.name ?? session.user.email ?? "U").slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {session.user.name ?? "ユーザー"}
              </div>
              <div className="truncate text-xs text-[var(--text-secondary)]">
                {session.user.email ?? "email@example.com"}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Link
          href="/auth/signin"
          className="block w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-center text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent)]/60 hover:text-[var(--accent)]"
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
    <div className="mt-4 border-b border-[var(--border)] pb-4">
      <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
        Workspace
      </div>
      {loading ? (
        <div className="text-xs text-[var(--text-muted)]">読み込み中...</div>
      ) : workspaces.length > 0 ? (
        <div className="grid gap-2">
          <select
            value={workspaceId ?? ""}
            onChange={async (event) => {
              const nextId = event.target.value;
              await setWorkspaceId(nextId);
              router.refresh();
            }}
            className="border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm text-[var(--text-secondary)]"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <Link
            href="/workspaces"
            className="border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-center text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/60 hover:text-[var(--accent)]"
          >
            管理
          </Link>
        </div>
      ) : (
        <Link
          href="/workspaces"
          className="border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-center text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent)]/60 hover:text-[var(--accent)]"
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
      <aside className="fixed left-0 top-0 hidden h-screen w-60 flex-col border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm lg:flex overflow-hidden">
        <div className="shrink-0 border-b border-[var(--border)] pb-4">
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
        <div className="shrink-0">
          <WorkspaceSelector />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavigationLinks pathname={pathname} isAdmin={session?.user?.role === "ADMIN"} />
        </div>
        <div className="shrink-0">
          <AccountSection session={session} status={status} />
        </div>
      </aside>
    </>
  );
}
