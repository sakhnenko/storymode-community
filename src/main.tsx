import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Sniff invite/recovery links BEFORE any Supabase client loads, so we don't
// lose the `type=invite`/`type=recovery` markers when supabase-js consumes the
// URL hash to hydrate the session. We also stash it in sessionStorage so the
// welcome chat (invites) and SetPassword page (recovery) can still detect the
// intent even after the hash is stripped.
try {
  const hash = window.location.hash || "";
  const isRecovery = hash.includes("type=recovery");
  if (hash.includes("type=invite") || isRecovery) {
    sessionStorage.setItem("pending_password_setup", "1");
    sessionStorage.setItem("password_setup_flow", isRecovery ? "recovery" : "invite");
    const target = isRecovery ? "/set-password" : "/welcome";
    if (window.location.pathname !== target) {
      window.history.replaceState(null, "", target + window.location.search + hash);
    }
  }
} catch {
  // noop
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>,
);
