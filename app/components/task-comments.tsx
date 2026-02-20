"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { CommentDTO } from "../../lib/contracts/comment";
import { LoadingButton } from "./loading-button";

type TaskCommentsProps = {
  taskId: string;
};

export function TaskComments({ taskId }: TaskCommentsProps) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [...prev, data.comment]);
        setNewComment("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (commentId: string) => {
    if (!editContent.trim()) return;
    setEditSubmitting(true);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => prev.map((c) => (c.id === commentId ? data.comment : c)));
        setEditingId(null);
        setEditContent("");
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm("このコメントを削除しますか？")) return;
    const res = await apiFetch(`/api/tasks/${taskId}/comments/${commentId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  };

  const startEdit = (comment: CommentDTO) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return <div className="text-sm text-[var(--text-muted)]">コメントを読み込み中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-[var(--text-primary)]">
        コメント ({comments.length})
      </div>

      {comments.length === 0 ? (
        <div className="text-sm text-[var(--text-muted)]">まだコメントがありません</div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {comment.author.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={comment.author.image}
                      alt={comment.author.name ?? ""}
                      className="h-6 w-6 rounded-full"
                    />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--muted)] text-xs font-semibold text-[var(--text-secondary)]">
                      {(comment.author.name ?? comment.author.email ?? "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {comment.author.name ?? comment.author.email}
                    </span>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      {formatDate(comment.createdAt)}
                      {comment.editedAt && " (編集済み)"}
                    </span>
                  </div>
                </div>
                {session?.user?.id === comment.authorId && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(comment)}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-xs text-[var(--text-muted)] hover:text-rose-500"
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
              {editingId === comment.id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="w-full border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                  <div className="flex gap-2">
                    <LoadingButton
                      onClick={() => handleEdit(comment.id)}
                      loading={editSubmitting}
                      className="bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white"
                    >
                      保存
                    </LoadingButton>
                    <button
                      onClick={cancelEdit}
                      className="border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                  {comment.content}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="コメントを入力..."
          rows={3}
          className="w-full border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        <LoadingButton
          onClick={handleSubmit}
          loading={submitting}
          disabled={!newComment.trim()}
          className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          コメントを投稿
        </LoadingButton>
      </div>
    </div>
  );
}
