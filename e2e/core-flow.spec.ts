import { expect, test } from "@playwright/test";

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
