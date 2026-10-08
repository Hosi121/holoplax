import type { ComponentProps } from "react";
import { useMemo } from "react";
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useSearchParams as useRouterSearchParams,
} from "react-router";

export function Link({
  href,
  ...props
}: Omit<ComponentProps<typeof RouterLink>, "to"> & { href: string }) {
  return <RouterLink to={href} {...props} />;
}

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams() {
  return useRouterSearchParams()[0];
}

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (url: string) => navigate(url),
      replace: (url: string) => navigate(url, { replace: true }),
      refresh: () => window.location.reload(),
    }),
    [navigate],
  );
}

export function Image({
  priority,
  unoptimized: _unoptimized,
  ...props
}: ComponentProps<"img"> & { priority?: boolean; unoptimized?: boolean }) {
  return <img loading={priority ? "eager" : "lazy"} decoding="async" {...props} />;
}
