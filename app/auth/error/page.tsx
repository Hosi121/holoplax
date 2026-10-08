import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "@/lib/navigation";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const error = searchParams.get("error");
    const callbackUrl = searchParams.get("callbackUrl");

    if (callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")) {
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
