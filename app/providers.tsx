"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { Sidebar } from "./components/sidebar";

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
      <div className="relative min-h-screen bg-white">
        <ConditionalSidebar />
        {children}
      </div>
    </SessionProvider>
  );
}
