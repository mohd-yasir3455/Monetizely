"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="shell" style={{ paddingTop: 32 }}>
          <div className="card">
            <div className="page-error">
              <div className="page-error-eyebrow">Application error</div>
              <h2>The app could not render this screen.</h2>
              <p>{error.message || "Check the deployment logs and try again."}</p>
              <div className="page-error-actions">
                <button onClick={() => reset()}>Try again</button>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
