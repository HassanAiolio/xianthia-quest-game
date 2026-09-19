import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { sound } from "./audio/sound";

// Browsers only allow audio after a user gesture: unlock it on the first one.
for (const event of ["pointerdown", "keydown"] as const) window.addEventListener(event, () => sound.unlock(), { passive: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
