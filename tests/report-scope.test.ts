/**
 * Unit tests for `src/lib/report-scope.ts` — the shared Prisma where
 * builder for role-aware report/analytics read scope.
 *
 * Product rule:
 *   - SYSTEM_OWNER  → platform-wide; honours ?organizationId=.
 *   - PARTNER_ADMIN → platform-wide read; own-org ANY visibility +
 *                     other-orgs PUBLISHED only; honours ?organizationId=
 *                     within that guard.
 *   - Anonymous / role missing → defensive fallback: PUBLISHED only.
 *
 * Write scope is unchanged and is not tested here — see
 * tests/api/projects.test.ts and tests/api/upload.test.ts.
 */

import { describe, expect, it } from "vitest";
import {
  buildReportOrgVisibilityScope,
  type ReportUser,
} from "@/lib/report-scope";

const systemOwner: ReportUser = {
  role: { role: "SYSTEM_OWNER", organizationId: null },
};

const partnerAdmin = (orgId: string): ReportUser => ({
  role: { role: "PARTNER_ADMIN", organizationId: orgId },
});

describe("buildReportOrgVisibilityScope · SYSTEM_OWNER", () => {
  it("returns an empty where (platform-wide) when no org id is requested", () => {
    expect(buildReportOrgVisibilityScope(systemOwner, null)).toEqual({});
  });

  it("narrows to the requested organizationId with no visibility guard", () => {
    expect(
      buildReportOrgVisibilityScope(systemOwner, "target-org"),
    ).toEqual({ organizationId: "target-org" });
  });

  it("treats empty / whitespace-only ?organizationId= as absent", () => {
    expect(buildReportOrgVisibilityScope(systemOwner, "")).toEqual({});
    expect(buildReportOrgVisibilityScope(systemOwner, "   ")).toEqual({});
  });
});

describe("buildReportOrgVisibilityScope · PARTNER_ADMIN", () => {
  it("returns an OR of own-org any visibility + PUBLISHED when no org id is requested", () => {
    const where = buildReportOrgVisibilityScope(
      partnerAdmin("org-partner"),
      null,
    );
    expect(where).toEqual({
      OR: [
        { organizationId: "org-partner" },
        { visibility: "PUBLISHED" },
      ],
    });
  });

  it("narrows to a requested peer org BUT retains the PUBLISHED visibility guard", () => {
    const where = buildReportOrgVisibilityScope(
      partnerAdmin("org-partner"),
      "peer-org",
    );
    // Must still carry the own-org / PUBLISHED OR-guard via the AND
    // composition so peer-org drafts can never surface.
    expect(where).toEqual({
      AND: [
        { organizationId: "peer-org" },
        {
          OR: [
            { organizationId: "org-partner" },
            { visibility: "PUBLISHED" },
          ],
        },
      ],
    });
  });

  it("narrows to own-org when that is the explicit filter (own branch of the OR still matches)", () => {
    const where = buildReportOrgVisibilityScope(
      partnerAdmin("org-partner"),
      "org-partner",
    );
    expect(where).toEqual({
      AND: [
        { organizationId: "org-partner" },
        {
          OR: [
            { organizationId: "org-partner" },
            { visibility: "PUBLISHED" },
          ],
        },
      ],
    });
  });

  it("treats empty / whitespace-only ?organizationId= as absent and returns the base OR-guard", () => {
    const expected = {
      OR: [
        { organizationId: "org-partner" },
        { visibility: "PUBLISHED" },
      ],
    };
    expect(
      buildReportOrgVisibilityScope(partnerAdmin("org-partner"), ""),
    ).toEqual(expected);
    expect(
      buildReportOrgVisibilityScope(partnerAdmin("org-partner"), "   "),
    ).toEqual(expected);
  });
});

describe("buildReportOrgVisibilityScope · defensive fallback", () => {
  it("falls back to PUBLISHED only when the user is null", () => {
    expect(buildReportOrgVisibilityScope(null, null)).toEqual({
      visibility: "PUBLISHED",
    });
  });

  it("falls back to PUBLISHED only when the user has no role", () => {
    expect(
      buildReportOrgVisibilityScope({ role: null } as ReportUser, null),
    ).toEqual({
      visibility: "PUBLISHED",
    });
  });

  it("falls back to PUBLISHED for PARTNER_ADMIN with no organizationId", () => {
    expect(
      buildReportOrgVisibilityScope(
        { role: { role: "PARTNER_ADMIN", organizationId: null } },
        null,
      ),
    ).toEqual({ visibility: "PUBLISHED" });
  });

  it("falls back to PUBLISHED for unknown role values", () => {
    expect(
      buildReportOrgVisibilityScope(
        { role: { role: "FUTURE_ROLE", organizationId: "x" } },
        null,
      ),
    ).toEqual({ visibility: "PUBLISHED" });
  });
});