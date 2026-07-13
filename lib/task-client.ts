import { apiFetch } from "./api-client";
import type { TaskDTO } from "./types";

type TaskPage = {
  tasks?: TaskDTO[];
  nextCursor?: string | null;
  hasMore?: boolean;
};

type TaskPageFetcher = (input: string) => Promise<Response>;

/** Load a complete task result set without silently truncating cursor pages. */
export async function fetchAllTasks(
  query: URLSearchParams | string,
  fetchPage: TaskPageFetcher = apiFetch,
): Promise<TaskDTO[]> {
  const base = new URLSearchParams(typeof query === "string" ? query : query.toString());
  base.delete("cursor");
  base.delete("page");
  base.set("limit", "500");
  const tasks = new Map<string, TaskDTO>();
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams(base);
    if (cursor) params.set("cursor", cursor);
    const response = await fetchPage(`/api/tasks?${params.toString()}`);
    if (!response.ok) throw new Error(`task list request failed (${response.status})`);
    const page = (await response.json()) as TaskPage;
    for (const task of page.tasks ?? []) tasks.set(task.id, task);
    if (!page.hasMore) break;
    if (!page.nextCursor || page.nextCursor === cursor) {
      throw new Error("task list pagination did not advance");
    }
    cursor = page.nextCursor;
  } while (cursor);

  return [...tasks.values()];
}
