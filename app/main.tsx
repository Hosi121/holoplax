import { lazy, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { useSession } from "@/lib/auth-client";
import { Providers } from "./providers";
import "./globals.css";

const publicPages = [
  { path: "/auth/error", Component: lazy(() => import("./auth/error/page")) },
  { path: "/auth/forgot", Component: lazy(() => import("./auth/forgot/page")) },
  { path: "/auth/reset", Component: lazy(() => import("./auth/reset/page")) },
  { path: "/auth/signin", Component: lazy(() => import("./auth/signin/page")) },
  { path: "/auth/verify", Component: lazy(() => import("./auth/verify/page")) },
];

const protectedPages = [
  { path: "/admin/ai", Component: lazy(() => import("./admin/ai/page")) },
  { path: "/admin/audit", Component: lazy(() => import("./admin/audit/page")) },
  { path: "/admin/users", Component: lazy(() => import("./admin/users/page")) },
  { path: "/automation", Component: lazy(() => import("./automation/page")) },
  { path: "/backlog", Component: lazy(() => import("./backlog/page")) },
  { path: "/delegate", Component: lazy(() => import("./delegate/page")) },
  { path: "/review", Component: lazy(() => import("./review/page")) },
  { path: "/settings", Component: lazy(() => import("./settings/page")) },
  { path: "/sprint", Component: lazy(() => import("./sprint/page")) },
  { path: "/workspaces/invite", Component: lazy(() => import("./workspaces/invite/page")) },
  { path: "/workspaces", Component: lazy(() => import("./workspaces/page")) },
];

function Protected() {
  const { data, status } = useSession();
  const location = useLocation();
  if (status === "loading")
    return (
      <p role="status" className="p-8">
        読み込み中…
      </p>
    );
  if (!data?.user)
    return (
      <Navigate
        to={`/auth/signin?callbackUrl=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  return <Outlet />;
}

function ScrollReset() {
  const { pathname, hash } = useLocation();
  // A route change should reset scroll even when the hash stays empty.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname triggers route scroll reset
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const scrollToAnchor = () => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target) return false;
      target.scrollIntoView();
      return true;
    };
    if (scrollToAnchor()) return;
    // Lazy pages and API data may render the anchor after navigation.
    const observer = new MutationObserver(() => {
      if (scrollToAnchor()) observer.disconnect();
    });
    observer.observe(document.getElementById("root")!, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, hash]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <Providers>
        <ScrollReset />
        <Suspense
          fallback={
            <p role="status" className="p-8">
              読み込み中…
            </p>
          }
        >
          <Routes>
            {publicPages.map(({ path, Component }) => (
              <Route key={path} path={path} element={<Component />} />
            ))}
            <Route element={<Protected />}>
              <Route path="/" element={<Navigate to="/backlog" replace />} />
              <Route path="/onboarding" element={<Navigate to="/backlog" replace />} />
              <Route path="/kanban" element={<Navigate to="/backlog?display=board" replace />} />
              <Route path="/velocity" element={<Navigate to="/review#completion-pace" replace />} />
              {protectedPages.map(({ path, Component }) => (
                <Route key={path} path={path} element={<Component />} />
              ))}
            </Route>
            <Route path="*" element={<p className="p-8">ページが見つかりません。</p>} />
          </Routes>
        </Suspense>
      </Providers>
    </BrowserRouter>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing");
createRoot(root).render(<App />);
