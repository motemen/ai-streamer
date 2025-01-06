import { useEffect, useState } from "react";
import PQueue from "p-queue";
import styles from "./App.module.css";
import {
  UPDATE_CAPTION,
  SET_AVATAR,
  PLAY_AUDIO,
  UpdateCaptionCommand,
  SetAvatarCommand,
  PlayAudioCommand,
} from "../commands";

function Caption({ text }: { text: string }) {
  return (
    <div className={styles.caption}>
      <div className={styles.text}>{text}</div>
      <div className={styles.shadow}>{text}</div>
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

function App() {
  const [caption, setCaption] = useState("");
  const [avatar, setAvatar] = useState("default");

  useEffect(() => {
    console.debug("Opening EventSource");
    const eventSource = new EventSource("/api/stream");

    let clearCaptionTimer: NodeJS.Timeout | null = null;

    eventSource.onopen = () => {
      console.debug("EventSource opened");
    };

    eventSource.addEventListener(UPDATE_CAPTION, (event) => {
      console.debug("UPDATE_CAPTION", event.data);
      const data = JSON.parse(event.data) as unknown as UpdateCaptionCommand;
      queue.add(() => {
        setCaption(data.caption);

        if (clearCaptionTimer) {
          clearTimeout(clearCaptionTimer);
        }
        clearCaptionTimer = setTimeout(() => {
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
      console.debug("PLAY_AUDIO", event.data);
      const data = JSON.parse(event.data) as unknown as PlayAudioCommand;
      queue.add(() => playAudio(data.audioDataBase64));
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

export default App;
