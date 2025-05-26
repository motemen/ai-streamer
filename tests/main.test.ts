import { test, expect } from "@playwright/test";

declare global {
  interface Window {
    _talkHistory?: string[];
  }
}

async function requestChatAPI({
  baseURL,
  prompt,
  direct = false,
  interrupt = false,
}: {
  baseURL?: string;
  prompt: string;
  direct?: boolean;
  interrupt?: boolean;
}) {
  return fetch(new URL("/api/chat", baseURL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, direct, interrupt }),
  });
}

test("/api/chat 経由で字幕が反映される (direct=true)", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");

  const messages = ["テストメッセージ", "こんにちは"];

  for (const message of messages) {
    const response = await requestChatAPI({
      baseURL,
      prompt: message,
      direct: true,
    });
    expect(response.ok).toBeTruthy();

    await expect(page.getByRole("caption")).toContainText(message);
  }
});

test("長い台詞の読み上げ中につぎの台詞が来ても混ざらない", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(0);

  await page.goto("/");

  const messageToBeInterrupted =
    "あー、今日もいろいろあったなぁ。なんか頭の中でやりたいことがいっぱい巡ってるけど、どれから手をつけたらいいんだろう。まぁ、考えてるだけで満足しちゃうんだよね。あ、そういえば最近ハマってるあのドラマ、次の話が楽しみすぎる！でも、一気見しちゃうと後が寂しいし、ちょっとずつ観た方がいいのかな。んー、でも結局全部見ちゃうんだよね…。まぁ、明日の予定も確認しなきゃだし、今日はこれくらいにしとこっかな。";
  const interruptMessage = "インタラプト！";

  void requestChatAPI({
    baseURL,
    prompt: messageToBeInterrupted,
    direct: true,
  });

  await page.waitForTimeout(1000);

  console.log("caption:", await page.getByRole("caption").textContent());

  await requestChatAPI({
    baseURL,
    prompt: interruptMessage,
    direct: true,
    interrupt: true,
  });

  await expect(page.getByRole("caption")).toContainText(interruptMessage);
  await page.evaluate(() => {
    const mut = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        (window._talkHistory = window._talkHistory || []).push(
          mutation.target.textContent ?? ""
        );
      }
    });
    mut.observe(document.querySelector("[role=caption]")!, {
      characterData: true,
      childList: true,
    });
  });

  await page.waitForTimeout(30 * 1000);

  const talkHistory = await page.evaluate(() => {
    return window._talkHistory ?? [];
  });

  console.log(talkHistory);
  expect(talkHistory.join("")).not.toContain("次の話が楽しみすぎる");

  await page.waitForTimeout(1000);
});

async function requestIdleAPI({ baseURL }: { baseURL?: string }) {
  return fetch(new URL("/api/idle", baseURL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // No body for this request
  });
}

test("/api/idle triggers speech line when prompt is configured", async ({
  page,
  baseURL,
}) => {
  await page.goto("/"); // Ensure page is loaded

  // Assume aiStreamer.config.idle.prompt is set in the test environment's config
  // and that the default prompt is "Thinking out loud..."
  const response = await requestIdleAPI({ baseURL });
  expect(response.ok).toBeTruthy();
  const json = await response.json();
  expect(json.message).toBe("ok");
  expect(json.speechLine).toBeDefined();
  // Check for caption update
  // This assumes the default idle prompt used by the server in test mode is "Thinking out loud..."
  // If this text is different or not set, this part of the test will fail.
  await expect(page.getByRole("caption")).toContainText(
    json.speechLine.text
  );
});

test("/api/idle returns 400 if no idle prompt is configured", async ({
  baseURL,
}) => {
  // This test assumes a scenario where aiStreamer.config.idle.prompt is undefined.
  // This might require a specific server configuration for this test to pass reliably.
  // If the server always has a default idle prompt, this test will fail.
  const response = await requestIdleAPI({ baseURL });
  expect(response.status).toBe(400);
  const json = await response.json();
  expect(json.error).toBe("No idle prompt configured");
});
