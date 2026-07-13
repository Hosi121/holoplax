"use client";

import { Bot, CheckCircle2, ClipboardList, Send, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { cn } from "../../lib/cn";
import { useToast } from "../components/toast";
import { DelegationJobCard, type DelegationJobDto } from "./delegation-job-card";

const examples = [
  "この文章を読みやすく整理して、短い要約も作って",
  "選択肢を比較するための観点と比較表を作って",
  "依頼メールの丁寧な下書きを作って",
];

const workingStatuses = new Set<DelegationJobDto["status"]>(["PENDING", "RUNNING"]);
const waitingStatuses = new Set<DelegationJobDto["status"]>(["NEEDS_APPROVAL", "NEEDS_INPUT"]);

function ColumnEmpty({ message, onAction }: { message: string; onAction: () => void }) {
  return (
    <div className="border border-dashed border-[var(--border)] p-6 text-center">
      <p className="text-pretty text-sm text-[var(--text-muted)]">{message}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-3 text-sm font-medium text-[var(--accent)] underline underline-offset-4"
      >
        新しい仕事を任せる
      </button>
    </div>
  );
}

function LoadingColumns() {
  return (
    <div className="grid gap-6 lg:grid-cols-3" aria-label="仕事を読み込み中">
      {["作業中", "確認待ち", "完了"].map((label) => (
        <section key={label} className="space-y-3">
          <div className="h-6 w-24 bg-[var(--muted)]" />
          <div className="space-y-3 border border-[var(--border)] p-4">
            <div className="h-3 w-20 bg-[var(--muted)]" />
            <div className="h-5 w-full bg-[var(--muted)]" />
            <div className="h-5 w-3/4 bg-[var(--muted)]" />
          </div>
        </section>
      ))}
    </div>
  );
}

export default function DelegatePage() {
  const toast = useToast();
  const [request, setRequest] = useState("");
  const [mode, setMode] = useState<"SAFE_AUTO" | "PREPARE">("SAFE_AUTO");
  const [jobs, setJobs] = useState<DelegationJobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const focusComposer = useCallback(() => {
    document.getElementById("delegation-request")?.focus();
    window.scrollTo({ top: 0 });
  }, []);

  const loadJobs = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await apiFetch("/api/delegations");
      if (!response.ok) throw new Error("load failed");
      const data = await response.json();
      setJobs(data.jobs ?? []);
      setLoadError(null);
    } catch {
      setLoadError("任せた仕事を読み込めませんでした。通信状態を確認してください。");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const hasActiveWork = jobs.some((job) => workingStatuses.has(job.status));
  useEffect(() => {
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => void loadJobs(true), 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveWork, loadJobs]);

  const submit = async () => {
    const trimmed = request.trim();
    if (trimmed.length < 3) {
      setFormError("任せたいことをもう少し具体的に入力してください。");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await apiFetch("/api/delegations", {
        method: "POST",
        body: JSON.stringify({ request: trimmed, mode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(data?.error?.message ?? "仕事を任せられませんでした。");
        return;
      }
      const job = data.job as DelegationJobDto;
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      setRequest("");
      if (job.status === "NEEDS_APPROVAL") {
        toast.warning("外部操作を含むため、確認待ちに移しました。");
      } else {
        toast.success(mode === "PREPARE" ? "下書き作成を始めました。" : "AIに任せました。");
      }
    } catch {
      setFormError("仕事を任せられませんでした。通信状態を確認してください。");
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (job: DelegationJobDto, action: "cancel" | "prepare" | "retry") => {
    setBusyJobId(job.id);
    try {
      const response = await apiFetch(`/api/delegations/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data?.error?.message ?? "状態を変更できませんでした。");
        return;
      }
      setJobs((current) =>
        current.map((item) => (item.id === job.id ? (data.job as DelegationJobDto) : item)),
      );
      if (action === "prepare") toast.success("安全な下書き作成を始めました。");
      if (action === "retry") toast.success("もう一度実行します。");
      if (action === "cancel") toast.info("仕事を中止しました。");
    } catch {
      toast.error("状態を変更できませんでした。通信状態を確認してください。");
    } finally {
      setBusyJobId(null);
    }
  };

  const revise = (job: DelegationJobDto) => {
    const issues = job.verification?.issues.map((issue) => `- ${issue}`).join("\n") ?? "";
    setRequest(issues ? `${job.request}\n\n追加情報:\n${issues}` : job.request);
    setMode("SAFE_AUTO");
    focusComposer();
  };

  const copyResult = async (result: string) => {
    try {
      await navigator.clipboard.writeText(result);
      toast.success("成果物をコピーしました。");
    } catch {
      toast.error("コピーできませんでした。成果物を選択してコピーしてください。");
    }
  };

  return (
    <main className="max-w-7xl flex-1 space-y-8 px-4 py-8 lg:ml-60 lg:px-8 lg:py-12">
      <header className="max-w-3xl">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
          <Bot className="size-5" />
          自分専用の実行AI
        </div>
        <h1 className="mt-2 text-balance text-3xl font-semibold text-[var(--text-primary)]">
          面倒な仕事を、そのまま任せる
        </h1>
        <p className="mt-2 text-pretty text-[var(--text-secondary)]">
          調査・整理・文章作成は安全なら自動で完了します。送信、公開、削除などは勝手に行いません。
        </p>
      </header>

      <section className="max-w-4xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <label
          htmlFor="delegation-request"
          className="text-sm font-semibold text-[var(--text-primary)]"
        >
          何を任せますか？
        </label>
        <textarea
          id="delegation-request"
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          maxLength={5000}
          rows={5}
          placeholder="例：このメモを整理して、明日そのまま使える説明文にして"
          className="mt-2 w-full resize-y border border-[var(--border)] bg-[var(--background)] p-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              type="button"
              key={example}
              onClick={() => setRequest(example)}
              className="border border-[var(--border)] px-2 py-1 text-left text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-4 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label
              htmlFor="delegation-mode"
              className="text-xs font-medium text-[var(--text-secondary)]"
            >
              任せ方
            </label>
            <select
              id="delegation-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as "SAFE_AUTO" | "PREPARE")}
              className="mt-1 block border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              <option value="SAFE_AUTO">安全なら自動で完了</option>
              <option value="PREPARE">下書きだけ作る</option>
            </select>
            <p className="mt-1 text-pretty text-xs text-[var(--text-muted)]">
              危険な操作は、どちらを選んでも自動実行しません。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className={cn(
              "inline-flex items-center justify-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white",
              submitting && "opacity-60",
            )}
          >
            <Send className="size-4" />
            {submitting ? "登録中…" : "AIに任せる"}
          </button>
        </div>
        {formError ? (
          <p className="mt-3 text-pretty text-sm text-rose-700" role="alert">
            {formError}
          </p>
        ) : null}
      </section>

      {loadError ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
          role="alert"
        >
          <p className="text-pretty">{loadError}</p>
          <button type="button" onClick={() => void loadJobs()} className="font-medium underline">
            再読み込み
          </button>
        </div>
      ) : null}

      {loading ? (
        <LoadingColumns />
      ) : (
        <DelegationColumns
          jobs={jobs}
          busyJobId={busyJobId}
          onAction={act}
          onRevise={revise}
          onCopy={copyResult}
          onEmptyAction={focusComposer}
        />
      )}
    </main>
  );
}

function DelegationColumns({
  jobs,
  busyJobId,
  onAction,
  onRevise,
  onCopy,
  onEmptyAction,
}: {
  jobs: DelegationJobDto[];
  busyJobId: string | null;
  onAction: (job: DelegationJobDto, action: "cancel" | "prepare" | "retry") => Promise<void>;
  onRevise: (job: DelegationJobDto) => void;
  onCopy: (result: string) => Promise<void>;
  onEmptyAction: () => void;
}) {
  const columns = [
    {
      id: "working",
      label: "作業中",
      icon: ClipboardList,
      iconClass: "text-[var(--accent)]",
      items: jobs.filter((job) => workingStatuses.has(job.status)),
      empty: "AIが作業している仕事はありません。",
    },
    {
      id: "waiting",
      label: "確認待ち",
      icon: ShieldAlert,
      iconClass: "text-amber-600",
      items: jobs.filter((job) => waitingStatuses.has(job.status)),
      empty: "あなたの判断を待っている仕事はありません。",
    },
    {
      id: "completed",
      label: "完了",
      icon: CheckCircle2,
      iconClass: "text-emerald-600",
      items: jobs.filter(
        (job) => !workingStatuses.has(job.status) && !waitingStatuses.has(job.status),
      ),
      empty: "完了した成果物はここに残ります。",
    },
  ];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      {columns.map((column) => (
        <section key={column.id} aria-labelledby={`${column.id}-heading`} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              id={`${column.id}-heading`}
              className="flex items-center gap-2 font-semibold text-[var(--text-primary)]"
            >
              <column.icon className={cn("size-5", column.iconClass)} />
              {column.label}
            </h2>
            <span className="tabular-nums text-sm text-[var(--text-muted)]">
              {column.items.length}
            </span>
          </div>
          {column.items.length ? (
            column.items.map((job) => (
              <DelegationJobCard
                key={job.id}
                job={job}
                busy={busyJobId === job.id}
                onAction={onAction}
                onRevise={onRevise}
                onCopy={onCopy}
              />
            ))
          ) : (
            <ColumnEmpty message={column.empty} onAction={onEmptyAction} />
          )}
        </section>
      ))}
    </div>
  );
}
