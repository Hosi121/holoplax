import { describe, expect, it, vi } from "vitest";
import { fetchAllTasks } from "../task-client";

const task = (id: string) => ({ id });
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("fetchAllTasks", () => {
  it("follows every cursor page and preserves repeated query filters", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(
        response({ tasks: [task("a")], hasMore: true, nextCursor: "cursor-a" }),
      )
      .mockResolvedValueOnce(response({ tasks: [task("b")], hasMore: false, nextCursor: null }));

    await expect(fetchAllTasks("status=BACKLOG&workflowState=READY", fetchPage)).resolves.toEqual([
      task("a"),
      task("b"),
    ]);
    expect(fetchPage).toHaveBeenNthCalledWith(2, expect.stringContaining("cursor=cursor-a"));
    expect(fetchPage).toHaveBeenNthCalledWith(2, expect.stringContaining("workflowState=READY"));
  });

  it("fails loudly if a server claims another page without a cursor", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValue(response({ tasks: [task("a")], hasMore: true, nextCursor: null }));
    await expect(fetchAllTasks("status=BACKLOG", fetchPage)).rejects.toThrow(
      "pagination did not advance",
    );
  });
});
