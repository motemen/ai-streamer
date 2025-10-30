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
          mutation.target.textContent ?? "",
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
