import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AIStreamer from "./AIStreamer.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AIStreamer />
  </StrictMode>
);
