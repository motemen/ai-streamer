# ai-streamer 概要

ai-streamer は、OpenAI と VOICEVOX を活用し、静止画ベースの VTuber 実況配信を自動化するシステムです。OBS の Browser Source として追加することで、AI による発話・字幕・表情制御をオールインワンで実現します。

## 使い方

1. リポジトリをクローンし、依存パッケージをインストール
2. `pnpm dev` でサーバ・フロントエンドを起動
3. OBS の Browser Source に `http://localhost:5173` を追加
4. 必要に応じて API（`/api/chat` など）を直接叩いて制御も可能

## 技術スタック

- OpenAI（台詞生成、Streaming 対応）
- VOICEVOX（音声合成、ずんだもんボイス等）
- Hono（API サーバ）
- Vite + React（フロントエンド）

## サーバ・フロントエンド間のシーケンス図

```mermaid
sequenceDiagram
  actor User as ユーザ
  participant Director as ディレクターコンソール (/director)
  participant ExternalDirector as 外部プログラム
  participant Server as サーバ (/api/*)
  participant Frontend as フロントエンド
  actor OBS as OBS Browser Source

  User->>Director: プロンプト入力
  Director->>Server: POST /api/chat

  activate Server
  Server->>Server: 台詞生成・音声合成
  Server->>Frontend: SSE /api/stream
  deactivate Server
  Frontend->>Frontend: キュー・再生
  Frontend-->>OBS: 取り込み

  opt キューが空のとき
    Frontend->>Server: POST /api/idle
    activate Server
    Server->>Server: 台詞生成・音声合成
    Server->>Frontend: SSE /api/stream
    deactivate Server
  end

  opt 外部プログラム利用
    ExternalDirector->>Server: POST /api/chat
  end
```

# Development

    open -a OBS --args --remote-debugging-port=9222 --remote-allow-origins=http://localhost:9222
