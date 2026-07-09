const requiredServerEnv = ["DATABASE_URL", "DIRECT_URL"] as const;

export function assertDatabaseEnv(): void {
  const missing = requiredServerEnv.filter((name) => !process.env[name]?.trim());

  if (missing.length === 0) return;

  throw new Error(
    `Missing required environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. ` +
      "Add both DATABASE_URL and DIRECT_URL before running locally or deploying to Vercel.",
  );
}
