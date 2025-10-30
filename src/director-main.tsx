import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Director from "./Director";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Director />
  </StrictMode>,
);
