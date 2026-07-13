import { AlertCircle, RotateCcw } from "lucide-react";

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="flex items-start justify-between gap-3 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
      role="alert"
    >
      <span className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>{message}</span>
      </span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1 font-semibold underline underline-offset-2"
        >
          <RotateCcw className="size-3" />
          再試行
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--muted)] ${className}`} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="grid gap-4" aria-label="読み込み中" aria-busy="true">
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}
