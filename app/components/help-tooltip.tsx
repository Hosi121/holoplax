"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function HelpTooltip({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-flex ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="text-[var(--text-muted)] transition hover:text-[var(--accent)]"
        aria-label="\u30D8\u30EB\u30D7"
      >
        <HelpCircle size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text-secondary)] shadow-lg">
          {text}
        </div>
      )}
    </div>
  );
}
