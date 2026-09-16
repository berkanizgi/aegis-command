import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import InformationDisplay from "./InformationDisplay";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.aegis?.surface === "information" ? <InformationDisplay /> : <App />}
  </React.StrictMode>,
);
