import { useEffect, useState } from "react";
import PQueue from "p-queue";

import styles from "./CaptionView.module.css";
import {
  UPDATE_CAPTION,
  PLAY_AUDIO,
  type UpdateCaptionCommand,
  type PlayAudioCommand,
  CLEAR_QUEUE,
  CONFIGURE,
  type ConfigureCommand,
  DEFAULT_SLOT,
} from "../commands";

const queue = new PQueue({ concurrency: 1 });

let idleTimer: NodeJS.Timeout | null = null;
let idleTimeout = 0;
let idleRunning = false;

queue.on("error", (err) => {
  console.error("queue error", err);
});

function notifyIdleLater() {
  if (idleTimeout) {
    idleTimer = setTimeout(() => {
      if (queue.size === 0 && queue.pending === 0 && !idleRunning) {
        console.debug("idle");
        queue.add(() => void fetch("/api/idle", { method: "POST" }));
        idleRunning = true;
      }
    }, idleTimeout);
  }
}

queue.on("idle", () => {
  console.debug("queue idle");

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  notifyIdleLater();
});

queue.on("next", () => {
  console.debug("queue next");

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  if (queue.size === 0) {
    notifyIdleLater();
  }
});

let audioContext: AudioContext | null = null;

function createAudioContext(): AudioContext {
  if (audioContext) {
    return audioContext;
  }

  audioContext = new AudioContext();
  if (audioContext.state === "suspended") {
    console.error("--autoplay-policy=no-user-gesture-required required");
    throw new Error("AudioContext is suspended");
  }
  return audioContext;
}

function postPlaybackState(slot: string, talking: boolean) {
  void fetch("/api/playback-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot, talking }),
  }).catch((err) => console.error("playback-state error", err));
}

async function playAudio(audioDataBase64: string, slot: string) {
  // --autoplay-policy=no-user-gesture-required が必要
  // <https://developer.chrome.com/blog/autoplay?hl=ja>
  const audioContext = createAudioContext();
  const audioData = Uint8Array.from(atob(audioDataBase64), (c) =>
    c.charCodeAt(0),
  ).buffer;

  const buffer = await audioContext.decodeAudioData(audioData);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);

  postPlaybackState(slot, true);
  source.start(0);

  return new Promise<void>((resolve) => {
    source.onended = () => {
      postPlaybackState(slot, false);
      resolve();
    };
  });
}

function CaptionView() {
  const [caption, setCaption] = useState("");

  useEffect(() => {
    console.debug("Opening EventSource");
    const eventSource = new EventSource("/api/stream");

    let clearCaptionTimer: NodeJS.Timeout | null = null;

    eventSource.onopen = () => {
      console.debug("EventSource opened");
    };

    eventSource.addEventListener(CONFIGURE, (event) => {
      console.debug("CONFIGURE", event.data);
      const data = JSON.parse(event.data) as unknown as ConfigureCommand;
      idleTimeout = data.config.idle?.timeout ?? 0;
    });

    eventSource.addEventListener(UPDATE_CAPTION, (event) => {
      console.log("UPDATE_CAPTION", event.data);
      const data = JSON.parse(event.data) as unknown as UpdateCaptionCommand;
      queue.add(() => {
        idleRunning = false;
        console.log("setCaption", data.caption);
        setCaption(data.caption);

        if (clearCaptionTimer) {
          clearTimeout(clearCaptionTimer);
        }
        clearCaptionTimer = setTimeout(() => {
          console.log("clearCaption");
          setCaption("");
        }, 5000);
      });
    });

    eventSource.addEventListener(PLAY_AUDIO, (event) => {
      console.log("PLAY_AUDIO");
      const data = JSON.parse(event.data) as unknown as PlayAudioCommand;
      const slot = data.slot ?? DEFAULT_SLOT;
      queue.add(() => playAudio(data.audioDataBase64, slot));
    });

    eventSource.addEventListener(CLEAR_QUEUE, () => {
      console.log("CLEAR_QUEUE");
      queue.clear();
    });

    eventSource.onerror = (err) => {
      console.error("EventSource error", err);
    };

    return () => {
      console.debug("Closing EventSource");
      eventSource.close();
    };
  }, []);

  return (
    <div className={styles.caption}>
      <div className={styles.text} role="caption">
        {caption}
      </div>
    </div>
  );
}

export default CaptionView;
