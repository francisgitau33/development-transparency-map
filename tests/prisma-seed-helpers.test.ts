import { describe, expect, it } from "vitest";

// Imported directly by relative path — the helper has zero runtime
// dependencies so no Prisma mock is needed.
import { resolveSystemOwnerEmail } from "../prisma/seed-helpers";

// NodeJS.ProcessEnv is declared as a required-NODE_ENV map, so we use a
// looser index-signature type here to avoid leaking NODE_ENV noise into
// every test case.
type EnvLike = Record<string, string | undefined>;

function env(overrides: EnvLike): NodeJS.ProcessEnv {
  return overrides as unknown as NodeJS.ProcessEnv;
}

describe("resolveSystemOwnerEmail", () => {
  it("returns the trimmed email when SYSTEM_OWNER_EMAIL is provided", () => {
    expect(
      resolveSystemOwnerEmail(env({ SYSTEM_OWNER_EMAIL: "owner@example.org" })),
    ).toBe("owner@example.org");
  });

  it("trims surrounding whitespace", () => {
    expect(
      resolveSystemOwnerEmail(
        env({ SYSTEM_OWNER_EMAIL: "   owner@example.org   " }),
      ),
    ).toBe("owner@example.org");
  });

  it("throws a clear, actionable error when SYSTEM_OWNER_EMAIL is missing", () => {
    expect(() => resolveSystemOwnerEmail(env({}))).toThrowError(
      /SYSTEM_OWNER_EMAIL is required to run the seed/,
    );
  });

  it("throws when SYSTEM_OWNER_EMAIL is blank", () => {
    expect(() =>
      resolveSystemOwnerEmail(env({ SYSTEM_OWNER_EMAIL: "" })),
    ).toThrowError(/SYSTEM_OWNER_EMAIL is required/);
  });

  it("throws when SYSTEM_OWNER_EMAIL is only whitespace", () => {
    expect(() =>
      resolveSystemOwnerEmail(env({ SYSTEM_OWNER_EMAIL: "   \t  " })),
    ).toThrowError(/SYSTEM_OWNER_EMAIL is required/);
  });

  it("error message mentions the env-var name and a copy-pasteable example", () => {
    try {
      resolveSystemOwnerEmail(env({}));
      expect.fail("expected resolveSystemOwnerEmail to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const message = (err as Error).message;
      expect(message).toContain("SYSTEM_OWNER_EMAIL");
      expect(message).toContain("npx prisma db seed");
      expect(message).toContain("no default");
    }
  });
});