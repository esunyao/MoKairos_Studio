import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/globals.css";
import App from "./App";

// 首屏装载前应用已保存的明暗主题，避免白屏闪烁
const savedTheme = localStorage.getItem("mokairos.theme");
document.documentElement.dataset.theme =
  savedTheme === "light" ? "light" : "dark";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
