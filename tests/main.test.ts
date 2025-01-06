import { test, expect } from "@playwright/test";

test("/api/chat 経由で字幕が反映される (direct=true)", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");

  const message = "テストメッセージ";
  const response = await fetch(new URL("/api/chat", baseURL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: message, direct: true }),
  });

  expect(response.ok).toBeTruthy();

  await expect(page.getByRole("caption")).toContainText(message);
});
