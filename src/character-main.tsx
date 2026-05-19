import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CharacterView from "./CharacterView.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CharacterView />
  </StrictMode>,
);
