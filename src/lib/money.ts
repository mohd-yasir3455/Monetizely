/**
 * All money in this application is stored and computed as integer cents.
 *
 * Rationale: floating point dollars silently drift (0.1 + 0.2 !== 0.3), and a
 * quoting tool that is off by a cent is a quoting tool nobody trusts. Cents are
 * exact for every operation we perform except percentage math, and there we
 * round explicitly and immediately.
 */

/**
 * Round half away from zero. This is what a person does on paper, and what a
 * customer expects when they check our arithmetic. Note that JavaScript's
 * Math.round() rounds half *up* (toward +Infinity), so -0.5 becomes -0, which
 * is not what we want for a credit line. All our inputs are non-negative today,
 * but the function should be correct regardless.
 */
export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Apply a basis-point rate to a cent amount and round to whole cents.
 * 1500 bps = 15%.
 */
export function applyBps(cents: number, bps: number): number {
  return roundHalfUp((cents * bps) / 10_000);
}

/** 2500 => "$25.00". Used in quote line items and totals. */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Compact form for prices that are nearly always whole dollars, e.g. "$50" for
 * a per-seat rate inside a calculation string. Falls back to cents when needed.
 */
export function formatCentsCompact(cents: number): string {
  if (cents % 100 === 0) {
    return `$${(cents / 100).toLocaleString("en-US")}`;
  }
  return formatCents(cents);
}

/** 1000 => "10%", 1550 => "15.5%" */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0$/, "")}%`;
}

/** "25.50" (user input, dollars) => 2550 (cents). Throws on garbage. */
export function dollarsToCents(input: string | number): number {
  const n = typeof input === "number" ? input : Number.parseFloat(input);
  if (!Number.isFinite(n)) throw new Error(`Not a valid dollar amount: ${input}`);
  return roundHalfUp(n * 100);
}

/** 10 (user input, percent) => 1000 (bps). */
export function percentToBps(input: string | number): number {
  const n = typeof input === "number" ? input : Number.parseFloat(input);
  if (!Number.isFinite(n)) throw new Error(`Not a valid percentage: ${input}`);
  return roundHalfUp(n * 100);
}
