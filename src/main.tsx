import { createRoot } from "react-dom/client";
import "./index.css";
import { registerAppServiceWorker } from "./lib/pwa/registerServiceWorker";

const root = createRoot(document.getElementById("root")!);

/**
 * /roadside boots through its own module graph. Nothing on this path imports
 * App.tsx, the auth provider, or the Supabase client, so the officer view
 * renders from IndexedDB whether the device is offline, has a dead session, or
 * is sitting on a connection that accepts requests and never answers.
 */
if (window.location.pathname.replace(/\/+$/, "") === "/roadside") {
  void import("./roadside/RoadsideEntry").then(({ default: RoadsideEntry }) => {
    root.render(<RoadsideEntry />);
  });
} else {
  void import("./App.tsx").then(({ default: App }) => {
    root.render(<App />);
  });
}

void registerAppServiceWorker();
