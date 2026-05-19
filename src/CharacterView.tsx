import { useEffect, useMemo, useState } from "react";

import styles from "./CharacterView.module.css";
import {
  SET_AVATAR,
  CHARACTER_TALKING,
  type SetAvatarCommand,
  type CharacterTalkingCommand,
  DEFAULT_SLOT,
} from "../commands";

type Props = {
  slot?: string;
};

function CharacterView({ slot: slotProp }: Props = {}) {
  const slot = useMemo(() => {
    if (slotProp) return slotProp;
    if (typeof window === "undefined") return DEFAULT_SLOT;
    return (
      new URLSearchParams(window.location.search).get("slot") ?? DEFAULT_SLOT
    );
  }, [slotProp]);

  const [avatar, setAvatar] = useState("default");
  const [talking, setTalking] = useState(false);

  useEffect(() => {
    console.debug("Opening EventSource (character)");
    const eventSource = new EventSource("/api/stream");

    eventSource.addEventListener(SET_AVATAR, (event) => {
      const data = JSON.parse(event.data) as unknown as SetAvatarCommand;
      if ((data.slot ?? DEFAULT_SLOT) !== slot) return;
      setAvatar(data.avatar);
    });

    eventSource.addEventListener(CHARACTER_TALKING, (event) => {
      const data = JSON.parse(event.data) as unknown as CharacterTalkingCommand;
      if (data.slot !== slot) return;
      setTalking(data.talking);
    });

    eventSource.onerror = (err) => {
      console.error("EventSource error", err);
    };

    return () => {
      eventSource.close();
    };
  }, [slot]);

  return (
    <div className={styles.avatar}>
      <img
        src={`/api/avatar/${avatar}.png`}
        className={`${styles.avatarImage} ${talking ? styles.talking : ""}`}
        onError={(ev) => {
          ev.currentTarget.src = "/api/avatar/default.png";
        }}
      />
    </div>
  );
}

export default CharacterView;
