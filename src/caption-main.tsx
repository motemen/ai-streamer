import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CaptionView from "./CaptionView.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CaptionView />
  </StrictMode>,
);
