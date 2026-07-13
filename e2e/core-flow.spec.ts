import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let createdUserEmail: string | null = null;

test.afterEach(async () => {
  if (!createdUserEmail) return;
  const user = await prisma.user.findUnique({
    where: { email: createdUserEmail },
    select: { id: true },
  });
  if (user) {
    await prisma.workspace.deleteMany({ where: { ownerId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  createdUserEmail = null;
});

test.afterAll(() => prisma.$disconnect());

test("health reports a reachable database", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    status: "healthy",
    database: "reachable",
  });
});

test("a new user can register, onboard, and see the first task", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  createdUserEmail = email;
  await page.goto("/auth/signin");
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
  await page.getByRole("button", { name: "利用を開始" }).click();

  await expect(page).toHaveURL(/\/backlog/);
  await expect(page.getByText("最初のE2Eタスク", { exact: true })).toBeVisible();

  const tasksResponse = await page.request.get("/api/tasks?status=BACKLOG");
  expect(tasksResponse.ok()).toBe(true);
  const task = (await tasksResponse.json()).tasks.find(
    (item: { title: string }) => item.title === "最初のE2Eタスク",
  );
  expect(task).toBeTruthy();

  const mutate = (url: string, method: "POST" | "PATCH", body?: unknown) =>
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
  // Wait for client hydration/account loading so a development compilation
  // refresh cannot replace the file input between selection and its handler.
  await expect(page.getByRole("textbox", { name: "メール" })).toHaveValue(email);
  const uploadPreparation = page.waitForResponse((response) =>
    response.url().includes("/api/storage/avatar"),
  );
  const objectUpload = page.waitForResponse(
    (response) => response.request().method() === "PUT" && response.url().includes(":9000/"),
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
  const saveAccount = page.getByRole("button", { name: "変更を保存" });
  await expect(saveAccount).toBeEnabled();
  await saveAccount.click();
  await expect(page.getByText("アカウント情報を保存しました。")).toBeVisible();

  await page.getByRole("button", { name: "接続キーを作成" }).click();
  await expect(page.getByText("このキーは一度だけ表示されます")).toBeVisible();
  await expect(page.locator("code").filter({ hasText: "mcp_" })).toBeVisible();
});
