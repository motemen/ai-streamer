import styles from "./AIStreamer.module.css";
import CaptionView from "./CaptionView";
import CharacterView from "./CharacterView";

function AIStreamer() {
  return (
    <div className={styles.container}>
      <CaptionView />
      <CharacterView />
    </div>
  );
}

export default AIStreamer;
