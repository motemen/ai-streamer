import { useState, useRef, useEffect } from "react";

interface LogEntry {
  id: string;
  prompt: string;
  status: "sending" | "sent" | "error";
  timestamp: Date;
  speechLine?: string[];
  error?: string;
}

export default function Director() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isValid, setIsValid] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);

  const handleChange = () => {
    setIsValid(formRef.current?.checkValidity() ?? true);
  };

  useEffect(() => {
    const form = formRef.current;
    form?.addEventListener("change", handleChange);
    form?.addEventListener("input", handleChange);
    return () => {
      form?.removeEventListener("change", handleChange);
      form?.removeEventListener("input", handleChange);
    };
  }, []);

  useEffect(() => {
    handleChange();
  });

  // ログエントリを追加する関数
  const addLogEntry = (entry: LogEntry) => {
    setLogs((prevLogs) => [entry, ...prevLogs]);
    return entry.id; // IDを返す
  };

  // ログエントリを更新する関数
  const updateLogEntry = (logId: string, update: Partial<LogEntry>) => {
    setLogs((prevLogs) =>
      prevLogs.map((log) => (log.id === logId ? { ...log, ...update } : log))
    );
  };

  // プロンプト送信処理
  const sendPrompt = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();

    const formData = new FormData(ev.currentTarget);
    const promptValue = formData.get("prompt") as string;

    if (!promptValue?.trim()) return;

    // 入力フィールドをクリア
    formRef.current?.reset();

    // ユニークなIDを生成
    const logId = `${Date.now()}.${Math.random().toString(36).substring(2)}`;

    // 送信中ログエントリを追加
    addLogEntry({
      id: logId,
      prompt: promptValue,
      status: "sending",
      timestamp: new Date(),
    });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptValue }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();

      // 成功状態にログを更新
      updateLogEntry(logId, {
        status: "sent",
        speechLine: result.speechLine,
      });
    } catch (error) {
      // エラー状態にログを更新
      updateLogEntry(logId, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleKeyDown = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key === "Enter" && ev.ctrlKey) {
      ev.preventDefault();
      ev.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <>
      <div className="max-w-3xl mx-auto my-8 px-4 font-sans">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          ディレクターコンソール
        </h2>

        <form
          onSubmit={sendPrompt}
          ref={formRef}
          className="flex flex-col gap-4"
        >
          <div className="flex gap-3">
            <textarea
              name="prompt"
              onKeyDown={handleKeyDown}
              rows={3}
              className="flex-1 p-3 text-base border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              placeholder="プロンプトを入力... (Ctrl+Enterで送信)"
              required
            />
            <button
              type="submit"
              disabled={!isValid}
              className="px-4 py-2 rounded-md text-white font-medium bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              送信
            </button>
          </div>
        </form>

        <h3 className="text-xl font-semibold mt-8 mb-4 text-gray-700">
          送信ログ
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 max-h-[50vh] overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              ログはまだありません
            </p>
          ) : (
            <ul className="space-y-3">
              {logs.map((log: LogEntry, i: number) => (
                <li
                  key={i}
                  className="p-3 border-b border-gray-200 last:border-b-0"
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center">
                      <span className="font-medium">{log.prompt}</span>
                      <div className="ml-2">
                        {log.status === "sending" && (
                          <span className="text-gray-500 inline-flex items-center">
                            <span>送信中</span>
                            <span className="ml-1 animate-pulse">...</span>
                          </span>
                        )}
                        {log.status === "sent" && (
                          <span className="text-green-600">✅</span>
                        )}
                        {log.status === "error" && (
                          <span className="text-red-600">❌ {log.error}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                      {log.timestamp.toLocaleString()}
                    </span>
                  </div>
                  {log.speechLine && (
                    <div className="mt-2 text-sm text-gray-700 p-2 bg-gray-100 rounded-md">
                      <div className="font-medium text-blue-700 mb-1">
                        セリフ:
                      </div>
                      <div className="whitespace-pre-wrap">
                        {log.speechLine.join(" ")}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
