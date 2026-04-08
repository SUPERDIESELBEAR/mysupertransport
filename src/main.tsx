import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Unregister stray service workers in preview/iframe contexts
const isInIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
const isPreviewHost = window.location.hostname.includes("id-preview--") || window.location.hostname.includes("lovableproject.com");
if (isInIframe || isPreviewHost) {
  navigator.serviceWorker?.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}

createRoot(document.getElementById("root")!).render(<App />);
