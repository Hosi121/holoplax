"use client";

import {
  Activity,
  BarChart3,
  Inbox,
  KanbanSquare,
  ListTodo,
  type LucideIcon,
  TrendingDown,
  Zap,
} from "lucide-react";
import Link from "next/link";

const iconMap: Record<string, LucideIcon> = {
  Activity,
  BarChart3,
  Inbox,
  KanbanSquare,
  ListTodo,
  TrendingDown,
  Zap,
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  icon: LucideIcon | string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const Icon = typeof icon === "string" ? (iconMap[icon] ?? BarChart3) : icon;

  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <Icon size={48} className="text-[var(--text-muted)]" />
      <h3 className="mt-4 font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          style={{ color: "#fff" }}
          className="mt-4 rounded-lg bg-[#2323eb] px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button
          onClick={onAction}
          className="mt-4 rounded-lg bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
