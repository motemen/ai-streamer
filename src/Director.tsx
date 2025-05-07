import { useState } from "react";

interface LogEntry {
  prompt: string;
  status: "sending" | "sent" | "error";
  response?: string;
  error?: string;
}

export default function Director() {
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!prompt.trim()) return;
    setSending(true);
    setLogs((prev) => [{ prompt, status: "sending" }, ...prev]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      setLogs((prev) => [{ prompt, status: "sent" }, ...prev.slice(1)]);
      setPrompt("");
    } catch (e: any) {
      setLogs((prev) => [
        { prompt, status: "error", error: e.message },
        ...prev.slice(1),
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{ maxWidth: 600, margin: "2em auto", fontFamily: "sans-serif" }}
    >
      <h2>ディレクターコンソール</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          style={{ flex: 1, fontSize: 16 }}
          placeholder="プロンプトを入力..."
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={sending || !prompt.trim()}
          style={{ fontSize: 16 }}
        >
          送信
        </button>
      </div>
      <div style={{ marginTop: 24 }}>
        <h3>送信ログ</h3>
        <ul style={{ padding: 0, listStyle: "none" }}>
          {logs.map((log, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: "bold" }}>{log.prompt}</span>
              {log.status === "sending" && (
                <span style={{ color: "#888" }}> ...送信中</span>
              )}
              {log.status === "sent" && (
                <span style={{ color: "green" }}> ✔️</span>
              )}
              {log.status === "error" && (
                <span style={{ color: "red" }}> ❌ {log.error}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
