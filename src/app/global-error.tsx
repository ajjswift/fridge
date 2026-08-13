"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[fridge] root render failed", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f7f7f2", color: "#1f3529", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ boxSizing: "border-box", display: "grid", minHeight: "100dvh", placeItems: "center", padding: 24 }}>
          <section style={{ boxSizing: "border-box", width: "min(100%, 420px)", border: "1px solid #d9e0d6", borderRadius: 24, background: "white", padding: 24 }}>
            <div style={{ fontSize: 36 }}>⚠️</div>
            <h1 style={{ margin: "16px 0 8px", fontSize: 22 }}>Fridge couldn&apos;t start</h1>
            <p style={{ color: "#53665a", lineHeight: 1.5 }}>Check your connection and try again. If it keeps happening, the service may need attention.</p>
            <button type="button" onClick={reset} style={{ border: 0, borderRadius: 12, background: "#278858", color: "white", cursor: "pointer", fontSize: 15, fontWeight: 600, padding: "12px 16px" }}>Try again</button>
            {error.digest && <p style={{ color: "#53665a", fontSize: 12, marginTop: 20, overflowWrap: "anywhere" }}>Support code: {error.digest}</p>}
          </section>
        </main>
      </body>
    </html>
  );
}
