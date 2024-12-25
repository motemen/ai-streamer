import { useEffect, useState } from "react";
import styles from "./App.module.css";
import {
  UPDATE_CAPTION,
  SET_AVATAR,
  UpdateCaptionCommand,
  SetAvatarCommand,
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
      setCaption(data.caption);

      if (clearCaptionTimer) {
        clearTimeout(clearCaptionTimer);
      }
      clearCaptionTimer = setTimeout(() => {
        setCaption("");
      }, 3000);
    });

    eventSource.addEventListener(SET_AVATAR, (event) => {
      console.debug("SET_AVATAR", event.data);
      const data = JSON.parse(event.data) as unknown as SetAvatarCommand;
      setAvatar(data.avatar);
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
    <>
      <div className={styles.container}>
        <Caption text={caption} />
        <Avatar name={avatar} />
      </div>
    </>
  );
}

export default App;
