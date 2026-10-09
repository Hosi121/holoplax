import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "@playwright/test";

test("health reports a reachable database", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["cache-control"]).toBe("no-store");
  await expect(response.json()).resolves.toMatchObject({
    status: "healthy",
    database: "reachable",
  });
  const providers = await (await request.get("/api/auth/providers")).json();
  expect(providers).not.toHaveProperty("discord");
  for (const url of [
    "/api/integrations/discord",
    "/api/integrations/discord/task",
    "/api/integrations/slack",
  ]) {
    expect((await request.get(url)).status()).toBe(404);
  }
});

test("a new user can register, onboard, and see the first task", async ({ page, baseURL }) => {
  const email = `e2e-${Date.now()}@example.test`;
  const signin = await page.goto("/auth/signin");
  expect(signin?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect((await page.context().cookies()).some(({ name }) => name === "csrf_token")).toBe(true);
  await page.getByRole("button", { name: "新規登録" }).click();
  await page.getByPlaceholder("名前").fill("E2E User");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill("e2e-password-123");
  await page.getByRole("button", { name: "登録して続行" }).click();

  await expect(page.getByRole("heading", { name: "Holoplaxを使い始める" })).toBeVisible();
  await page.getByPlaceholder("例: 新サービス開発").fill("E2E Workspace");
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByPlaceholder("やること 1（任意）").fill("最初のE2Eタスク");
  const onboardingCompleted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/onboarding",
  );
  await page.getByRole("button", { name: "利用を開始" }).click();
  expect((await onboardingCompleted).status()).toBe(200);

  await expect(page).toHaveURL(/\/delegate/);
  await expect(page.getByRole("heading", { name: "面倒な仕事を、そのまま任せる" })).toBeVisible();

  await page
    .getByPlaceholder("例：このメモを整理して、明日そのまま使える説明文にして")
    .fill("この内容をメールで送って");
  const delegationCreated = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/delegations",
  );
  await page.getByRole("button", { name: "AIに任せる" }).click();
  expect((await delegationCreated).status()).toBe(201);
  await expect(
    page.getByText("外部サービスや実行環境を変更する操作が含まれています。"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "下書きだけ作る" })).toBeVisible();

  await page.getByLabel("任せ方").selectOption("PREPARE");
  await page
    .getByPlaceholder("例：このメモを整理して、明日そのまま使える説明文にして")
    .fill("APIキーを使って文章を作って");
  const sensitiveDelegationRejected = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/delegations",
  );
  await page.getByRole("button", { name: "AIに任せる" }).click();
  expect((await sensitiveDelegationRejected).status()).toBe(400);
  await expect(page.getByText(/機密情報や個人情報が含まれている可能性があります/)).toBeVisible();
  const delegatedWork = await page.request.get("/api/delegations");
  expect(delegatedWork.ok()).toBe(true);
  expect((await delegatedWork.json()).jobs).toHaveLength(1);

  await page.goto("/backlog");
  await expect(page.getByText("最初のE2Eタスク", { exact: true })).toBeVisible();

  const tasksResponse = await page.request.get("/api/tasks?status=BACKLOG");
  expect(tasksResponse.ok()).toBe(true);
  const task = (await tasksResponse.json()).tasks.find(
    (item: { title: string }) => item.title === "最初のE2Eタスク",
  );
  expect(task).toBeTruthy();

  const mutate = (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) =>
    page.evaluate(
      async ({ url, method, body }) => {
        const csrfToken = document.cookie
          .split(";")
          .map((cookie) => cookie.trim())
          .find((cookie) => cookie.startsWith("csrf_token="))
          ?.slice("csrf_token=".length);
        const response = await fetch(url, {
          method,
          headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: response.status, data: await response.json() };
      },
      { url, method, body },
    );

  expect((await mutate("/api/sprints/current", "POST", { capacityPoints: 5 })).status).toBe(200);
  const candidateBody = (title: string) => ({
    title,
    points: 3,
    urgency: "MEDIUM",
    risk: "MEDIUM",
    status: "BACKLOG",
    type: "TASK",
  });
  const [candidateA, candidateB] = await Promise.all([
    mutate("/api/tasks", "POST", candidateBody("並行候補A")),
    mutate("/api/tasks", "POST", candidateBody("並行候補B")),
  ]);
  expect(candidateA.status).toBe(200);
  expect(candidateB.status).toBe(200);
  const candidates = [candidateA.data.task, candidateB.data.task];
  const commitments = await Promise.all(
    candidates.map((candidate: { id: string }) =>
      mutate(`/api/tasks/${candidate.id}`, "PATCH", { status: "SPRINT" }),
    ),
  );
  const commitmentStatuses = commitments.map(({ status }) => status);
  expect(commitmentStatuses.filter((status) => status === 200)).toHaveLength(1);
  expect([400, 409]).toContain(commitmentStatuses.find((status) => status !== 200));
  const executionTask = candidates[commitments.findIndex(({ status }) => status === 200)];

  expect(
    (await mutate(`/api/tasks/${executionTask.id}`, "PATCH", { workflowState: "IN_PROGRESS" }))
      .status,
  ).toBe(200);
  expect(
    (await mutate(`/api/tasks/${executionTask.id}`, "PATCH", { workflowState: "DONE" })).status,
  ).toBe(200);

  const currentSprint = await page.request.get("/api/sprints/current");
  await expect(currentSprint.json()).resolves.toMatchObject({
    sprint: { committedPoints: 3, activePoints: 3, completedPoints: 3 },
  });
  expect((await mutate("/api/sprints/current", "PATCH")).status).toBe(200);
  const velocity = await page.request.get("/api/velocity");
  await expect(velocity.json()).resolves.toMatchObject({ velocity: [{ points: 3 }] });

  const accountLoaded = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" && new URL(response.url()).pathname === "/api/account",
  );
  await page.goto("/settings");
  expect((await accountLoaded).status()).toBe(200);
  // Wait for account loading before editing the form.
  await expect(page.getByRole("textbox", { name: "メール" })).toHaveValue(email);
  const uploadPreparation = page.waitForResponse((response) =>
    response.url().includes("/api/storage/avatar"),
  );
  const objectUpload = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().includes("/api/storage/avatar/upload"),
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  expect((await uploadPreparation).status()).toBe(200);
  expect((await objectUpload).status()).toBe(200);
  const { uploadUrl, publicUrl } = await (await uploadPreparation).json();
  const publicImage = await page.request.get(publicUrl);
  expect(publicImage.status()).toBe(200);
  expect(publicImage.headers()["content-type"]).toBe("image/png");
  const image = await publicImage.body();
  expect(
    (
      await page.request.put(uploadUrl, { headers: { "content-type": "image/png" }, data: image })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.put(uploadUrl, { headers: { "content-type": "text/html" }, data: image })
    ).status(),
  ).toBe(400);
  const tampered = new URL(uploadUrl);
  tampered.searchParams.set("token", "invalid");
  expect((await page.request.put(tampered.href, { data: image })).status()).toBe(403);
  const invalidUpload = await mutate("/api/storage/avatar", "POST", {
    filename: "bad.svg",
    contentType: "image/svg+xml",
    size: 10,
  });
  expect(invalidUpload.status).toBe(400);
  const oversize = await mutate("/api/storage/avatar", "POST", {
    filename: "large.png",
    contentType: "image/png",
    size: 5 * 1024 * 1024 + 1,
  });
  expect(oversize.status).toBe(400);
  const saveAccount = page.getByRole("button", { name: "変更を保存" });
  await expect(saveAccount).toBeEnabled();
  await saveAccount.click();
  await expect(page.getByText("アカウント情報を保存しました。")).toBeVisible();

  await page.getByRole("button", { name: "接続キーを作成" }).click();
  await expect(page.getByText("このキーは一度だけ表示されます")).toBeVisible();
  await expect(page.locator("code").filter({ hasText: "mcp_" })).toBeVisible();

  const apiKey = (await page.locator("code").filter({ hasText: "mcp_" }).textContent())!.trim();
  const mcp = new Client({ name: "holoplax-e2e", version: "1.0.0" });
  await mcp.connect(
    new StreamableHTTPClientTransport(new URL("/mcp", baseURL), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    }),
  );
  try {
    expect((await mcp.listTools()).tools.map((tool) => tool.name)).toContain("list_tasks");
    const result = await mcp.callTool({ name: "list_tasks", arguments: { status: ["BACKLOG"] } });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result.content)).toContain("最初のE2Eタスク");
    const keys = await (await page.request.get("/api/mcp/keys")).json();
    expect((await mutate(`/api/mcp/keys?id=${keys.keys[0].id}`, "DELETE")).status).toBe(200);
    await expect(mcp.listTools()).rejects.toThrow();
  } finally {
    await mcp.close();
  }
  expect(
    (
      await page.request.post("/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } })
    ).status(),
  ).toBe(401);
  await page.goto("/velocity");
  await expect(page).toHaveURL(/\/review#completion-pace$/);
  await expect(page.getByRole("heading", { name: "今回の進み方を振り返る" })).toBeVisible();
  await page.locator("header").getByRole("link", { name: "やることへ", exact: true }).click();
  await expect(page).toHaveURL(/\/backlog$/);
  await expect(page.getByText("最初のE2Eタスク", { exact: true })).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await page.goto("/review");
  await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Freview$/);
  await expect(page.request.get("/api/review").then((response) => response.status())).resolves.toBe(
    401,
  );
});
