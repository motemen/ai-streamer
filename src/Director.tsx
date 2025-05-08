import { useState, useRef, useEffect, useActionState } from "react";

interface LogEntry {
  id: string;
  prompt: string;
  status: "sending" | "sent" | "error";
  response?: string;
  error?: string;
}

interface State {
  status: "idle" | "submitting" | "success" | "error";
  logs: LogEntry[];
  error?: string;
  result?: { message: string };
}

export default function Director() {
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

  // 外部からログエントリを更新するための関数はuseActionState内で実装

  const [state, sendPrompt, isPending] = useActionState<State, FormData>(
    async (prevState: State, formData: FormData): Promise<State> => {
      // ログエントリの更新操作の場合の処理
      const updateLogId = formData.get("_update_log");
      const updateType = formData.get("_update_type");
      
      if (updateLogId && updateType === "update_log") {
        // ログ更新の場合、状態タイプに応じてログエントリを更新
        const status = formData.get("status");
        
        if (status === "sent") {
          // 送信成功の場合
          return {
            ...prevState,
            status: "success",
            logs: prevState.logs.map(log => 
              log.id === updateLogId ? 
              { ...log, status: "sent" as const } : 
              log
            )
          };
        } else if (status === "error") {
          // エラーの場合
          const error = formData.get("error") as string;
          return {
            ...prevState,
            logs: prevState.logs.map(log => 
              log.id === updateLogId ? 
              { ...log, status: "error" as const, error } : 
              log
            )
          };
        }
        
        return prevState;
      }
      
      // 通常のプロンプト送信処理
      const promptValue = formData.get("prompt") as string;

      if (!promptValue?.trim()) {
        return {
          ...prevState,
          status: "error",
          error: "プロンプトが空です",
        };
      }

      // ユニークなIDを生成
      const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 入力フィールドをクリア
      formRef.current?.reset();
      
      // 送信中状態をログに追加して即座に返す
      const sendingState: State = {
        ...prevState,
        status: "submitting",
        logs: [{ id: logId, prompt: promptValue, status: "sending" }, ...prevState.logs],
      };

      // 非同期でfetchを行い、結果によってログエントリを更新
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptValue }),
      })
      .then(async (res) => {
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText);
        }
        
        const result = await res.json();
        
        // 成功状態のログ更新
        const updateFormData = new FormData();
        updateFormData.append("_update_log", logId);
        updateFormData.append("_update_type", "update_log");
        updateFormData.append("status", "sent");
        updateFormData.append("response", result.message || "");
        
        sendPrompt(updateFormData);
      })
      .catch((e: Error) => {
        // エラー状態のログ更新
        const updateFormData = new FormData();
        updateFormData.append("_update_log", logId);
        updateFormData.append("_update_type", "update_log");
        updateFormData.append("status", "error");
        updateFormData.append("error", e.message);
        
        sendPrompt(updateFormData);
      });

      return sendingState;
    },
    { status: "idle", logs: [] }
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.ctrlKey && state.status !== "submitting") {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).form?.requestSubmit();
    }
  };

  return (
    <>
      <div className="max-w-3xl mx-auto my-8 px-4 font-sans">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          ディレクターコンソール
        </h2>

        <form action={sendPrompt} ref={formRef} className="flex flex-col gap-4">
          <div className="flex gap-3">
            <textarea
              name="prompt"
              onKeyDown={handleKeyDown}
              rows={3}
              className="flex-1 p-3 text-base border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              placeholder="プロンプトを入力... (Ctrl+Enterで送信)"
              disabled={isPending}
              required
            />
            <button
              type="submit"
              disabled={isPending || !isValid}
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
          {state.logs.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              ログはまだありません
            </p>
          ) : (
            <ul className="space-y-3">
              {state.logs.map((log: LogEntry, i: number) => (
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
    </>
  );
}
