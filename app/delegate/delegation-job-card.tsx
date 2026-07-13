"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  FileText,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { ConfirmDialog } from "../components/ui/confirm-dialog";

export type DelegationJobDto = {
  id: string;
  request: string;
  mode: "PREPARE" | "SAFE_AUTO";
  kind: "RESEARCH" | "WRITING" | "CODE" | "GENERAL";
  risk: "LOW" | "REVIEW" | "RESTRICTED";
  status:
    | "PENDING"
    | "RUNNING"
    | "NEEDS_APPROVAL"
    | "NEEDS_INPUT"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELED";
  approvalReason: string | null;
  plan: {
    decision: { outcome: "AUTO" } | { outcome: "REVIEW"; reason: string; safeFallback: "PREPARE" };
    steps: string[];
    completionCriteria: string[];
  };
  result: string | null;
  verification: {
    passed: boolean;
    summary: string;
    issues: string[];
    method: "ai" | "basic";
  } | null;
  lastError: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

const statusView = {
  PENDING: { label: "開始待ち", icon: Clock3, style: "border-sky-200 bg-sky-50 text-sky-800" },
  RUNNING: { label: "作業中", icon: Clock3, style: "border-blue-200 bg-blue-50 text-blue-800" },
  NEEDS_APPROVAL: {
    label: "確認待ち",
    icon: ShieldAlert,
    style: "border-amber-200 bg-amber-50 text-amber-900",
  },
  NEEDS_INPUT: {
    label: "追加情報が必要",
    icon: AlertTriangle,
    style: "border-amber-200 bg-amber-50 text-amber-900",
  },
  SUCCEEDED: {
    label: "完了",
    icon: CheckCircle2,
    style: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  FAILED: { label: "失敗", icon: XCircle, style: "border-rose-200 bg-rose-50 text-rose-800" },
  CANCELED: {
    label: "中止",
    icon: XCircle,
    style: "border-slate-200 bg-slate-50 text-slate-700",
  },
} as const;

const kindLabels: Record<DelegationJobDto["kind"], string> = {
  RESEARCH: "調査・整理",
  WRITING: "文章作成",
  CODE: "コード案",
  GENERAL: "一般",
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function DelegationJobCard({
  job,
  busy,
  onAction,
  onRevise,
  onCopy,
}: {
  job: DelegationJobDto;
  busy: boolean;
  onAction: (job: DelegationJobDto, action: "cancel" | "prepare" | "retry") => Promise<void>;
  onRevise: (job: DelegationJobDto) => void;
  onCopy: (result: string) => Promise<void>;
}) {
  const status = statusView[job.status];
  const StatusIcon = status.icon;
  const canCancel = ["PENDING", "RUNNING", "NEEDS_APPROVAL", "NEEDS_INPUT"].includes(job.status);

  return (
    <article className="border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[var(--text-muted)]">
            {kindLabels[job.kind]}・{formatDate(job.createdAt)}
          </p>
          <h3 className="mt-1 text-pretty font-semibold text-[var(--text-primary)]">
            {job.request}
          </h3>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 border px-2 py-1 text-xs font-medium",
            status.style,
          )}
        >
          <StatusIcon className="size-3.5" />
          {status.label}
        </span>
      </div>

      {job.approvalReason ? (
        <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="text-pretty">{job.approvalReason}</p>
          <p className="mt-1 text-pretty text-xs text-amber-800">
            外部操作はまだ接続されていません。安全な下書きだけなら続けられます。
          </p>
        </div>
      ) : null}

      {job.status === "NEEDS_INPUT" && job.verification ? (
        <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">完了と判断できませんでした</p>
          <p className="mt-1 text-pretty">{job.verification.summary}</p>
          {job.verification.issues.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {job.verification.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {job.status === "FAILED" && job.lastError ? (
        <p className="mt-4 border border-rose-200 bg-rose-50 p-3 text-pretty text-sm text-rose-900">
          {job.lastError}
        </p>
      ) : null}

      {job.result ? (
        <details
          className="mt-4 border-t border-[var(--border)] pt-3"
          open={job.status === "SUCCEEDED"}
        >
          <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
            成果物を見る
          </summary>
          <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap bg-[var(--muted)] p-3 text-pretty text-sm leading-6 text-[var(--text-primary)]">
            {job.result}
          </div>
          {job.verification ? (
            <p className="mt-2 text-pretty text-xs text-[var(--text-muted)]">
              確認結果: {job.verification.summary}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void onCopy(job.result!)}
            className="mt-3 inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <ClipboardCopy className="size-4" />
            成果物をコピー
          </button>
        </details>
      ) : null}

      <details className="mt-4 border-t border-[var(--border)] pt-3">
        <summary className="cursor-pointer text-xs text-[var(--text-muted)]">進め方を見る</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-[var(--text-secondary)]">
          {job.plan.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>

      <div className="mt-4 flex flex-wrap gap-2">
        {job.status === "NEEDS_APPROVAL" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAction(job, "prepare")}
            className="inline-flex items-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <FileText className="size-4" />
            下書きだけ作る
          </button>
        ) : null}
        {job.status === "NEEDS_INPUT" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRevise(job)}
            className="inline-flex items-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <RotateCcw className="size-4" />
            情報を補ってやり直す
          </button>
        ) : null}
        {job.status === "FAILED" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAction(job, "retry")}
            className="inline-flex items-center gap-2 border border-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent)] disabled:opacity-60"
          >
            <RotateCcw className="size-4" />
            再実行
          </button>
        ) : null}
        {canCancel ? (
          <ConfirmDialog
            trigger={
              <button
                type="button"
                disabled={busy}
                className="border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] disabled:opacity-60"
              >
                中止する
              </button>
            }
            title="この仕事を中止しますか？"
            description="AIが作業中の場合も、生成された結果は完了として保存されません。"
            confirmLabel="中止する"
            onConfirm={() => onAction(job, "cancel")}
          />
        ) : null}
      </div>
    </article>
  );
}
