"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../providers";

type ThemeOption = {
  value: "light" | "dark" | "system";
  label: string;
  icon: typeof Sun;
};

const options: ThemeOption[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] p-1">
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = theme === option.value;
        return (
          <button
            key={option.value}
            onClick={() => setTheme(option.value)}
            title={option.label}
            className={`flex items-center justify-center rounded p-1.5 transition ${
              isActive
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
