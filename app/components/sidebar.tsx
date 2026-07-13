"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { Dialog } from "@base-ui/react/dialog";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ChevronDown,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Menu as MenuIcon,
  Settings,
  Users,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { memo, useCallback, useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { useWorkspaceStore } from "../../lib/stores/workspace-store";
import { NAV_LABELS } from "../../lib/ui-language";
import { ThemeToggle } from "./theme-toggle";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  tooltip: string;
  adminOnly?: boolean;
  /** Workflow step number shown as a circled digit badge */
  step?: number;
};

const STORAGE_KEY = "holoplax-sidebar-collapsed";

/* ── Primary workflow items (always visible) ── */
const primaryItems: NavItem[] = [
  {
    label: NAV_LABELS.backlog,
    href: "/backlog",
    icon: Inbox,
    tooltip: "これから取り組む候補を整理する",
    step: 1,
  },
  {
    label: NAV_LABELS.sprint,
    href: "/sprint",
    icon: KanbanSquare,
    tooltip: "今回進める内容と上限ポイントを管理する",
    step: 2,
  },
  {
    label: NAV_LABELS.review,
    href: "/review",
    icon: LayoutDashboard,
    tooltip: "完了ペースと進み方を振り返る",
    step: 3,
  },
];

/* ── Secondary sections (collapsed by default) ── */
const secondarySections: {
  heading: string;
  items: NavItem[];
}[] = [
  {
    heading: "ワークスペース",
    items: [
      {
        label: "ワークスペース",
        href: "/workspaces",
        icon: Users,
        tooltip: "参加中ワークスペースを管理",
      },
    ],
  },
  {
    heading: "自動化",
    items: [
      {
        label: NAV_LABELS.automation,
        href: "/automation",
        icon: Zap,
        tooltip: "AIに任せる範囲と分割の境界値を設定する",
      },
    ],
  },
  {
    heading: "設定",
    items: [
      {
        label: "設定",
        href: "/settings",
        icon: Settings,
        tooltip: "個人設定や認証状態を確認",
      },
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

const STEP_LABELS = ["", "\u2460", "\u2461", "\u2462"]; // ①②③

/* ── Nav link component ── */
function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href;
  return (
    <Link
      href={item.href}
      title={item.tooltip}
      className={`flex items-center gap-2 border px-3 py-2 text-sm transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] ${
        isActive
          ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]"
          : "border-transparent text-[var(--text-secondary)]"
      }`}
    >
      <item.icon size={16} />
      <span className="flex-1">{item.label}</span>
      {item.step != null && (
        <span className="text-[11px] leading-none text-[var(--text-muted)]">
          {STEP_LABELS[item.step]}
        </span>
      )}
    </Link>
  );
}

/* ── Primary workflow section ── */
const PrimaryNav = memo(function PrimaryNav({ pathname }: { pathname: string }) {
  return (
    <div className="space-y-1 border-b border-[var(--border)] pb-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase text-[var(--text-muted)]">ワークフロー</div>
        <span className="text-[10px] text-[var(--text-muted)]">
          {"\u2460\u2192\u2461\u2192\u2462"}
        </span>
      </div>
      <div className="mt-1 flex flex-col gap-1">
        {primaryItems.map((item) => (
          <NavLink key={item.label} item={item} pathname={pathname} />
        ))}
      </div>
    </div>
  );
});

/* ── Collapsible secondary sections ── */
const SecondaryNav = memo(function SecondaryNav({
  pathname,
  isAdmin,
  collapsed,
  onToggle,
}: {
  pathname: string;
  isAdmin: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Collapsible.Root open={!collapsed} onOpenChange={onToggle} className="mt-1">
      <Collapsible.Trigger className="flex w-full items-center gap-1 py-1 text-[11px] uppercase text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]">
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
        />
        <span>その他</span>
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <div>
          {secondarySections.map((section) => {
            const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
            if (visibleItems.length === 0) return null;
            return (
              <div
                key={section.heading}
                className="space-y-1 border-b border-[var(--border)] pb-3 last:border-none last:pb-0"
              >
                <div className="text-[11px] uppercase text-[var(--text-muted)]">
                  {section.heading}
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  {visibleItems.map((item) => (
                    <NavLink key={item.label} item={item} pathname={pathname} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
});

/* ── Navigation Links (primary + secondary) ── */
const NavigationLinks = memo(function NavigationLinks({
  pathname,
  isAdmin,
}: {
  pathname: string;
  isAdmin: boolean;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Read persisted state on mount
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
          setCollapsed(stored === "true");
        }
      } catch {
        // localStorage may be unavailable
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Avoid hydration mismatch: render secondary collapsed until client hydrates
  const effectiveCollapsed = hydrated ? collapsed : true;

  return (
    <nav className="mt-4 flex flex-col gap-1">
      <PrimaryNav pathname={pathname} />
      <SecondaryNav
        pathname={pathname}
        isAdmin={isAdmin}
        collapsed={effectiveCollapsed}
        onToggle={handleToggle}
      />
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
        <span className="text-[11px] uppercase text-[var(--text-muted)]">Theme</span>
        <ThemeToggle />
      </div>
      {status === "loading" ? (
        <div className="text-[11px] text-[var(--text-muted)]">読み込み中...</div>
      ) : session?.user ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase text-[var(--text-muted)]">Account</div>
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
              <Image
                src={session.user.image}
                alt={session.user.name ?? session.user.email ?? "User"}
                width={40}
                height={40}
                unoptimized
                className="size-10 border border-[var(--border)] object-cover"
              />
            ) : (
              <div className="flex size-10 items-center justify-center border border-[var(--border)] bg-[var(--muted)] text-sm font-semibold text-[var(--text-secondary)]">
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
      <div className="mb-2 text-[11px] text-[var(--text-muted)]">ワークスペース</div>
      {loading ? (
        <div className="text-xs text-[var(--text-muted)]">読み込み中...</div>
      ) : workspaces.length > 0 ? (
        <div className="grid gap-2">
          <select
            value={workspaceId ?? ""}
            onChange={async (event) => {
              const nextId = event.target.value;
              try {
                await setWorkspaceId(nextId);
                router.refresh();
              } catch {
                // setWorkspaceId already reverted the optimistic state; avoid an
                // unhandled rejection and skip the refresh on failure.
              }
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
      <aside className="fixed left-0 top-0 hidden h-dvh w-60 flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm lg:flex">
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
      <MobileNavigation
        pathname={pathname}
        session={session}
        status={status}
        isAdmin={session?.user?.role === "ADMIN"}
      />
    </>
  );
}

function MobileNavigation({
  pathname,
  session,
  status,
  isAdmin,
}: {
  pathname: string;
  session: ReturnType<typeof useSession>["data"];
  status: ReturnType<typeof useSession>["status"];
  isAdmin: boolean;
}) {
  return (
    <Dialog.Root>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[var(--border)] bg-[var(--surface)] [padding-bottom:env(safe-area-inset-bottom)] lg:hidden">
        {primaryItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-[var(--text-muted)]",
                active && "text-[var(--accent)]",
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <Dialog.Trigger className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-[var(--text-muted)]">
          <MenuIcon className="size-5" />
          <span>その他</span>
        </Dialog.Trigger>
      </nav>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex justify-end lg:hidden">
          <Dialog.Popup className="h-dvh w-[min(22rem,88vw)] overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-[var(--text-primary)] shadow-xl outline-none">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
              <Dialog.Title className="text-balance font-semibold">メニュー</Dialog.Title>
              <Dialog.Close className="border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                閉じる
              </Dialog.Close>
            </div>
            <WorkspaceSelector />
            <nav className="mt-4 grid gap-4">
              {secondarySections.map((section) => {
                const visible = section.items.filter((item) => !item.adminOnly || isAdmin);
                if (!visible.length) return null;
                return (
                  <section key={section.heading} className="grid gap-1">
                    <h2 className="text-xs font-semibold text-[var(--text-muted)]">
                      {section.heading}
                    </h2>
                    {visible.map((item) => (
                      <Dialog.Close
                        key={item.href}
                        render={
                          <Link
                            href={item.href}
                            className={cn(
                              "flex items-center gap-3 border border-transparent px-3 py-2 text-sm text-[var(--text-secondary)]",
                              pathname === item.href &&
                                "border-[var(--border)] bg-[var(--muted)] text-[var(--accent)]",
                            )}
                          >
                            <item.icon className="size-4" />
                            {item.label}
                          </Link>
                        }
                      />
                    ))}
                  </section>
                );
              })}
            </nav>
            <div className="mt-6">
              <AccountSection session={session} status={status} />
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
