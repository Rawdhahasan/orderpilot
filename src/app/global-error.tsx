"use client";

/** Last-resort error page; it replaces the root layout, so it styles itself. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#F6F7F9",
          color: "#0B1B36",
        }}
      >
        <main style={{ textAlign: "center", padding: 16 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>We couldn&apos;t load OrderPilot</h1>
          <p style={{ color: "#4E586A" }}>
            Something went wrong on our side. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 6,
              border: 0,
              background: "#1F5BFF",
              color: "#fff",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ fontFamily: "monospace", fontSize: 12, color: "#667085" }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
