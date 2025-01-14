import { useEffect, useState } from "react";
import PQueue from "p-queue";

import styles from "./AIStreamer.module.css";
import {
  UPDATE_CAPTION,
  SET_AVATAR,
  PLAY_AUDIO,
  UpdateCaptionCommand,
  SetAvatarCommand,
  PlayAudioCommand,
  CLEAR_QUEUE,
  CONFIGURE,
  ConfigureCommand,
} from "../commands";

function Caption({ text }: { text: string }) {
  return (
    <div className={styles.caption}>
      <div className={styles.text} role="caption">
        {text}
      </div>
      <div className={styles.shadow} role="none">
        {text}
      </div>
    </div>
  );
}

function Avatar({ name = "default" }: { name: string }) {
  return (
    <div className={styles.avatar}>
      <img
        src={`/api/avatar/${name}.png`}
        className={styles.avatarImage}
        onError={(ev) => {
          ev.currentTarget.src = "/api/avatar/default.png";
        }}
      />
    </div>
  );
}

const queue = new PQueue({ concurrency: 1 });

let idleTimer: NodeJS.Timeout | null = null;
let idleTimeout = 0;

// ヒマになったらサーバ側に通知する
queue.on("idle", () => {
  console.debug("queue idle");

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (idleTimeout) {
    idleTimer = setTimeout(() => {
      if (queue.size === 0 && queue.pending === 0) {
        console.debug("idle");
        void fetch("/api/idle", { method: "POST" });
      }
    }, idleTimeout);
  }
});

queue.on("next", () => {
  console.debug("queue next");

  if (idleTimer && queue.size > 0) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
});

function AIStreamer() {
  const [caption, setCaption] = useState("");
  const [avatar, setAvatar] = useState("default");

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
        console.log("setCaption", data.caption);
        setCaption(data.caption);

        if (clearCaptionTimer) {
          clearTimeout(clearCaptionTimer);
        }
        clearCaptionTimer = setTimeout(() => {
          console.log("clearCaption");
          setCaption("");
        }, 3000);
      });
    });

    eventSource.addEventListener(SET_AVATAR, (event) => {
      console.debug("SET_AVATAR", event.data);
      const data = JSON.parse(event.data) as unknown as SetAvatarCommand;
      queue.add(() => setAvatar(data.avatar));
    });

    eventSource.addEventListener(PLAY_AUDIO, (event) => {
      console.log("PLAY_AUDIO");
      const data = JSON.parse(event.data) as unknown as PlayAudioCommand;
      queue.add(() => playAudio(data.audioDataBase64));
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

  const playAudio = async (audioDataBase64: string) => {
    // --autoplay-policy=no-user-gesture-required が必要
    // <https://developer.chrome.com/blog/autoplay?hl=ja>
    const audioContext = new AudioContext();
    if (audioContext.state === "suspended") {
      console.error("--autoplay-policy=no-user-gesture-required required");
      // TODO: なんか表示する
    }

    const audioData = Uint8Array.from(atob(audioDataBase64), (c) =>
      c.charCodeAt(0)
    ).buffer;

    const buffer = await audioContext.decodeAudioData(audioData);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);

    return new Promise<void>((resolve) => {
      source.onended = () => {
        resolve();
      };
    });
  };

  return (
    <>
      <div className={styles.container}>
        <Caption text={caption} />
        <Avatar name={avatar} />
      </div>
    </>
  );
}

export default AIStreamer;
