"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Sidebar } from "./components/sidebar";
import { ToastProvider } from "./components/toast";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  const applyTheme = useCallback((t: Theme) => {
    const resolved = t === "system" ? getSystemTheme() : t;
    setResolvedTheme(resolved);
    if (resolved === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      localStorage.setItem("theme", t);
      applyTheme(t);
    },
    [applyTheme],
  );

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    const initial = stored ?? "system";
    setThemeState(initial);
    applyTheme(initial);
    setMounted(true);
  }, [applyTheme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, applyTheme]);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function ConditionalSidebar() {
  const pathname = usePathname();
  const hideSidebar =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/workspaces/invite");

  if (hideSidebar) return null;
  return <Sidebar />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <ToastProvider>
          <div className="relative min-h-screen bg-[var(--background)]">
            <ConditionalSidebar />
            {children}
          </div>
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
