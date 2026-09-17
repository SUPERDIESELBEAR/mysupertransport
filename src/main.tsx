import { createRoot } from "react-dom/client";
import "./index.css";
import { registerAppServiceWorker } from "./lib/pwa/registerServiceWorker";
import { ELD_FEATURE_HIDDEN, ELD_HIDDEN_MESSAGE } from "./lib/eld/featureVisibility";

const root = createRoot(document.getElementById("root")!);

/**
 * /roadside used to boot through its own module graph so the officer view
 * rendered from IndexedDB with no session and no network. The duty-status
 * feature is hidden (owner decision (b), 2026-09-17), so the branch now
 * renders a plain notice instead of RoadsidePacket. Nothing is deleted:
 * src/roadside/RoadsideEntry.tsx and the whole of src/lib/eld/ remain, and
 * restoring the branch is a one-line change guarded by ELD_FEATURE_HIDDEN.
 */
if (window.location.pathname.replace(/\/+$/, "") === "/roadside") {
  if (ELD_FEATURE_HIDDEN) {
    root.render(
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#111111", color: "#cfcfcf", fontFamily: "system-ui, sans-serif", fontSize: "15px", padding: "24px", textAlign: "center" }}>
        {ELD_HIDDEN_MESSAGE}
      </div>,
    );
  } else {
    void import("./roadside/RoadsideEntry").then(({ default: RoadsideEntry }) => {
      root.render(<RoadsideEntry />);
    });
  }
} else {
  void import("./App.tsx").then(({ default: App }) => {
    root.render(<App />);
  });
}

void registerAppServiceWorker();
