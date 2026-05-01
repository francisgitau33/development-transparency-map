/**
 * Pure helpers for the Prisma seed script.
 *
 * Kept in a separate module (no `PrismaClient` side-effects at import
 * time) so they can be unit-tested without spinning up a database.
 */

/**
 * Resolve the initial System Owner email from the environment.
 *
 * The seed has NO default fallback so that no personal email is ever
 * written by a production seed run. If `SYSTEM_OWNER_EMAIL` is missing
 * or blank we throw an error whose message tells the operator exactly
 * how to re-run the seed.
 */
export function resolveSystemOwnerEmail(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.SYSTEM_OWNER_EMAIL;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(
      "SYSTEM_OWNER_EMAIL is required to run the seed. " +
        "Set it in your environment (e.g. `SYSTEM_OWNER_EMAIL=owner@example.org " +
        "SYSTEM_OWNER_PASSWORD=... npx prisma db seed`) — there is no default " +
        "fallback so no personal email is ever written by the seed.",
    );
  }
  return raw.trim();
}