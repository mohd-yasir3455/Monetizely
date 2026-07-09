import { Prisma } from "@prisma/client";

const PRISMA_KNOWN_ERROR_MESSAGES: Record<string, string> = {
  P1000: "The database credentials were rejected. Check the connection strings in your environment.",
  P1001: "The app could not reach the database. Check that the database is online and the URL is correct.",
  P1002: "The database connection timed out. Try again in a moment.",
  P1017: "The database connection was interrupted. Try again in a moment.",
  P2024: "The database connection pool timed out. This usually means the database is overloaded or misconfigured.",
};

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function getActionErrorMessages(error: unknown, fallback: string): string[] {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return ["That name is already used. Pick a different one."];
    }

    const message = PRISMA_KNOWN_ERROR_MESSAGES[error.code];
    if (message) return [message];
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return [
      "The app could not initialize its database connection. Check DATABASE_URL and DIRECT_URL before deploying.",
    ];
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return ["The database client crashed while saving. Try again in a moment."];
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return ["The database returned an unexpected error. Try again in a moment."];
  }

  return [fallback];
}

export function getPageErrorMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "The app could not connect to its database. On Vercel, confirm DATABASE_URL and DIRECT_URL are both set.";
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      PRISMA_KNOWN_ERROR_MESSAGES[error.code] ??
      "The page could not load data from the database. Try again in a moment."
    );
  }

  if (error instanceof Error && /DATABASE_URL|DIRECT_URL/.test(error.message)) {
    return error.message;
  }

  return "The page could not load its data right now. Try again in a moment.";
}
