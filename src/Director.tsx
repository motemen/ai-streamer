import { useState, useRef } from "react";
import { useActionState } from "react";

interface LogEntry {
  prompt: string;
  status: "sending" | "sent" | "error";
  response?: string;
  error?: string;
}

interface ActionState {
  status: "idle" | "submitting" | "success" | "error";
  error?: string;
  result?: { message: string };
}

export default function Director() {
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const previousPromptRef = useRef("");
  
  const [state, sendPrompt] = useActionState(
    async (_prevState: ActionState, formData: FormData) => {
      const promptValue = formData.get("prompt") as string;
      
      if (!promptValue?.trim()) return { status: "error", error: "プロンプトが空です" };
      
      previousPromptRef.current = promptValue;
      
      // 送信中状態をログに追加
      setLogs((prev) => [{ prompt: promptValue, status: "sending" }, ...prev]);
      
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: promptValue }),
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText);
        }
        
        const result = await res.json();
        
        // 成功状態をログに更新
        setLogs((prev) => [
          { prompt: promptValue, status: "sent" },
          ...prev.slice(1),
        ]);
        
        // 入力フィールドをクリア
        setPrompt("");
        
        return { status: "success", result };
      } catch (e: any) {
        // エラー状態をログに更新
        setLogs((prev) => [
          { prompt: promptValue, status: "error", error: e.message },
          ...prev.slice(1),
        ]);
        
        return { status: "error", error: e.message };
      }
    },
    { status: "idle" } as ActionState
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.ctrlKey && state.status !== "submitting" && prompt.trim()) {
      e.preventDefault();
      const formData = new FormData();
      formData.append("prompt", prompt);
      sendPrompt(formData);
    }
  };

  const isSubmitting = state.status === "submitting";

  return (
    <div className="max-w-3xl mx-auto my-8 px-4 font-sans">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        ディレクターコンソール
      </h2>

      <form 
        action={sendPrompt}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          // フォーム送信後にプロンプトをクリアするためにデフォルトの挙動を防止
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          sendPrompt(formData);
        }}
      >
        <div className="flex gap-3">
          <textarea
            name="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            className="flex-1 p-3 text-base border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            placeholder="プロンプトを入力... (Ctrl+Enterで送信)"
            disabled={isSubmitting}
          />
          <button
            type="submit"
            disabled={isSubmitting || !prompt.trim()}
            className={`px-4 py-2 rounded-md text-white font-medium ${
              isSubmitting || !prompt.trim()
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
            }`}
          >
            送信
          </button>
        </div>
      </form>
      </div>

      <div className="mt-8">
        <h3 className="text-xl font-semibold mb-4 text-gray-700">送信ログ</h3>
        <div className="bg-gray-50 rounded-lg p-4 max-h-[50vh] overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              ログはまだありません
            </p>
          ) : (
            <ul className="space-y-3">
              {logs.map((log, i) => (
                <li
                  key={i}
                  className="p-3 border-b border-gray-200 last:border-b-0"
                >
                  <span className="font-medium">{log.prompt}</span>
                  {log.status === "sending" && (
                    <span className="ml-2 text-gray-500 inline-flex items-center">
                      <span>送信中</span>
                      <span className="ml-1 animate-pulse">...</span>
                    </span>
                  )}
                  {log.status === "sent" && (
                    <span className="ml-2 text-green-600"> ✅</span>
                  )}
                  {log.status === "error" && (
                    <span className="ml-2 text-red-600"> ❌ {log.error}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
