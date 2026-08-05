import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./style/index.css";
import "./style/globals.scss";
import App from "./App.tsx";
import { initializeConfig } from "./services/api";

const startApp = async () => {
  await initializeConfig();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

startApp();
