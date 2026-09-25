import { createRoot } from "react-dom/client";
import "./index.css";
import { registerAppServiceWorker } from "./lib/pwa/registerServiceWorker";
import { ELD_FEATURE_HIDDEN, ELD_HIDDEN_MESSAGE } from "./lib/eld/featureVisibility";
import { importWithRetry } from "./lib/lazyWithRetry";

const root = createRoot(document.getElementById("root")!);

function renderStartupError() {
  root.render(
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">SUPERDRIVE couldn’t finish loading</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The app may have updated while this page was open. Refresh to load the current version.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Refresh SUPERDRIVE
        </button>
      </section>
    </main>,
  );
}

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
    void importWithRetry(() => import("./roadside/RoadsideEntry"))
      .then(({ default: RoadsideEntry }) => {
        root.render(<RoadsideEntry />);
      })
      .catch(renderStartupError);
  }
} else {
  void importWithRetry(() => import("./App.tsx"))
    .then(({ default: App }) => {
      root.render(<App />);
    })
    .catch(renderStartupError);
}

void registerAppServiceWorker();
