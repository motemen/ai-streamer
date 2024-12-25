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

function Avatar({
  name = "default",
}: {
  name: string;
  availableList: string[];
}) {
  return (
    <div className={styles.avatar}>
      <img src={`/avatar/${name}.png`} className={styles.avatarImage} />
    </div>
  );
}

function App() {
  const [caption, setCaption] = useState("");

  useEffect(() => {
    console.log("Opening EventSource");
    const eventSource = new EventSource("/api/stream");

    eventSource.onopen = () => {
      console.log("EventSource open");
    };

    eventSource.addEventListener("setCaption", (event) => {
      console.log("setCaption", event);
      const data = JSON.parse(event.data);
      setCaption(data.text);
    });

    eventSource.onmessage = (event) => {
      console.log("onmessage", event);
      const data = JSON.parse(event.data);
      if (data.type === "setCaption") {
        setCaption(data.text);
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
        <Caption text={caption} />
        <Avatar name="default" availableList={["default"] /*FIXME*/} />
      </div>
    </>
  );
}

export default App;
