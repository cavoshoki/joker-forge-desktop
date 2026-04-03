import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initializeRuleCatalogFromRust } from "@/components/rule-builder/rule-catalog";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

async function bootstrap() {
  try {
    await initializeRuleCatalogFromRust();
  } catch (error) {
    console.error("Failed to initialize Rust catalog", error);
  }

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
