"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="shell">
      <div className="card">
        <div className="page-error">
          <div className="page-error-eyebrow">Something went wrong</div>
          <h2>The app hit an unexpected error.</h2>
          <p>{error.message || "Try again, and if the problem persists check the server logs."}</p>
          <div className="page-error-actions">
            <button onClick={() => reset()}>Try again</button>
          </div>
        </div>
      </div>
    </main>
  );
}
