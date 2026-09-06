"use client";

/**
 * This replaces the ENTIRE root layout when triggered (Next.js requires
 * it to render its own <html>/<body>), which means it can be reached in
 * a scenario where something in the root layout itself — globals.css,
 * font loading, ToastProvider — is what failed. Deliberately does not
 * import globals.css, Tailwind classes, or any CSS custom property: all
 * of those are exactly the kind of thing that could be broken in this
 * specific failure mode, so this stays plain inline styles as a genuine
 * last resort rather than reusing the design system.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#0b0d10",
          color: "#e7e9ea",
          fontFamily: "system-ui, sans-serif",
          margin: 0,
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ color: "#8b92a0", marginBottom: 16 }}>
              The application hit an unexpected error. Try reloading the page.
            </p>
            <button
              onClick={reset}
              style={{
                background: "#e7e9ea",
                color: "#0b0d10",
                padding: "8px 20px",
                borderRadius: 6,
                border: "none",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
