import { useEffect, useState } from "react";
import styles from "./App.module.css";

function Caption({ text }: { text: string }) {
  return (
    <div className={styles.caption}>
      <div className={styles.text}>{text}</div>
      <div className={styles.shadow}>{text}</div>
    </div>
  );
}

function Avatar() {
  return (
    <div className={styles.avatar}>
      <img src="/avatar/default.png" className={styles.avatarImage} />
    </div>
  );
}

function App() {
  const [text, setText] = useState("");

  useEffect(() => {
    console.log("Opening EventSource");
    const eventSource = new EventSource("/api/stream");

    eventSource.onopen = () => {
      console.log("EventSource open");
    };

    eventSource.addEventListener("setCaption", (event) => {
      console.log("setCaption", event);
      const data = JSON.parse(event.data);
      setText(data.text);
    });

    eventSource.onmessage = (event) => {
      console.log("onmessage", event);
      const data = JSON.parse(event.data);
      if (data.type === "setCaption") {
        setText(data.text);
      } else {
        console.error("Unknown event type", event.data);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource error", err);
    };

    return () => {
      console.log("Closing EventSource");
      eventSource.close();
    };
  }, []);

  return (
    <>
      <div className={styles.container}>
        <Caption text={text} />
        <Avatar />
      </div>
    </>
  );
}

export default App;
