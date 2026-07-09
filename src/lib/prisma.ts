import { PrismaClient } from "@prisma/client";

import { assertDatabaseEnv } from "./env";

// Next.js hot-reloads modules in development, which would otherwise open a new
// connection pool on every save until Postgres refuses them.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

assertDatabaseEnv();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
