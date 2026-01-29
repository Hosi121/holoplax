"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const error = searchParams.get("error");
    const callbackUrl = searchParams.get("callbackUrl");

    if (callbackUrl && callbackUrl.startsWith("/")) {
      const separator = callbackUrl.includes("?") ? "&" : "?";
      router.replace(`${callbackUrl}${separator}error=${error || "Unknown"}`);
    } else {
      router.replace(`/auth/signin?error=${error || "Unknown"}`);
    }
  }, [searchParams, router]);

  return null;
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <AuthErrorContent />
    </Suspense>
  );
}
