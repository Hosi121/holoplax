"use client";

import { BarChart3, ListTodo, X, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "holoplax-quickstart-dismissed";

const steps = [
  {
    icon: ListTodo,
    number: "\u2460",
    title: "\u30D0\u30C3\u30AF\u30ED\u30B0\u306B\u30BF\u30B9\u30AF\u3092\u8FFD\u52A0",
    description:
      "\u307E\u305A\u306F\u3084\u308B\u3079\u304D\u3053\u3068\u3092\u30EA\u30B9\u30C8\u30A2\u30C3\u30D7\u3002AI\u304C\u30B9\u30B3\u30A2\u3092\u63A8\u5B9A\u3057\u307E\u3059\u3002",
    href: "/backlog",
  },
  {
    icon: Zap,
    number: "\u2461",
    title: "\u30B9\u30D7\u30EA\u30F3\u30C8\u3092\u8A08\u753B",
    description:
      "\u30AD\u30E3\u30D1\u3092\u8A2D\u5B9A\u3057\u3066\u30BF\u30B9\u30AF\u3092\u30B3\u30DF\u30C3\u30C8\u3002\u6700\u9069\u5316\u3082\u3067\u304D\u307E\u3059\u3002",
    href: "/sprint",
  },
  {
    icon: BarChart3,
    number: "\u2462",
    title: "\u3075\u308A\u304B\u3048\u308A",
    description:
      "\u30D9\u30ED\u30B7\u30C6\u30A3\u3068\u30D0\u30FC\u30F3\u30C0\u30A6\u30F3\u3067\u6539\u5584\u70B9\u3092\u898B\u3064\u3051\u307E\u3057\u3087\u3046\u3002",
    href: "/review",
  },
];

export function QuickStartCard() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== "true") {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  return (
    <div className="relative border border-[var(--border)] rounded-xl bg-[var(--surface)] p-6 shadow-sm">
      <button
        onClick={handleDismiss}
        className="absolute right-4 top-4 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        aria-label="\u9589\u3058\u308B"
      >
        <X size={18} />
      </button>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Holoplaxへようこそ</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          3ステップでスプリント管理を始めましょう。
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-4 lg:flex-row">
        {steps.map((step) => (
          <Link
            key={step.href}
            href={step.href}
            className="flex flex-1 items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 transition hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
              <step.icon size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                <span className="mr-1 text-[var(--accent)]">{step.number}</span>
                {step.title}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{step.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleDismiss}
          className="text-xs text-[var(--text-muted)] transition hover:text-[var(--accent)]"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
