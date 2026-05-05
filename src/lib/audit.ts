import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Canonical audit event actions. Keep this list in sync with the PRD §9.6
 * requirements. Strings are stored verbatim in AuditEvent.action.
 */
export const AUDIT_ACTIONS = {
  USER_APPROVED: "USER_APPROVED",
  USER_DECLINED: "USER_DECLINED",
  ROLE_ASSIGNED: "ROLE_ASSIGNED",
  ORGANIZATION_CREATED: "ORGANIZATION_CREATED",
  ORGANIZATION_UPDATED: "ORGANIZATION_UPDATED",
  // Hard delete of an Organization by SYSTEM_OWNER. Blocked by the API
  // when the organisation has linked projects or users; the UI is
  // expected to surface the blocking reason. Payload captures the
  // organisation name + type for post-hoc review.
  ORGANIZATION_DELETED: "ORGANIZATION_DELETED",
  PROJECT_CREATED: "PROJECT_CREATED",
  PROJECT_UPDATED: "PROJECT_UPDATED",
  PROJECT_DELETED: "PROJECT_DELETED",
  PROJECT_VISIBILITY_CHANGED: "PROJECT_VISIBILITY_CHANGED",
  UPLOAD_COMPLETED: "UPLOAD_COMPLETED",
  CMS_UPDATED: "CMS_UPDATED",
  // Reference-data soft/hard delete by SYSTEM_OWNER.
  // Always accompanied by `entityType` = "ReferenceCountry" |
  // "AdministrativeArea" | "Donor" | "ReferenceSector" and a payload that
  // includes the display name, the mode ("soft" | "hard") and any blocked
  // dependency counts. See src/lib/reference-delete.ts.
  REFERENCE_DELETED: "REFERENCE_DELETED",
  REFERENCE_DELETE_BLOCKED: "REFERENCE_DELETE_BLOCKED",
  SYSTEM_OWNER_SEED_VERIFIED: "SYSTEM_OWNER_SEED_VERIFIED",
  // Team-member CMS (SYSTEM_OWNER-only). Each event carries the
  // member's name + role at time of mutation, for post-hoc review.
  TEAM_MEMBER_CREATED: "TEAM_MEMBER_CREATED",
  TEAM_MEMBER_UPDATED: "TEAM_MEMBER_UPDATED",
  TEAM_MEMBER_DELETED: "TEAM_MEMBER_DELETED",
  // Home-page and public-links CMS (SYSTEM_OWNER-only). Stored under the
  // CMS_UPDATED umbrella with a distinguishing entityType so audit
  // consumers can filter by "CmsHome" / "CmsPublicLinks" without adding
  // new action values. These constants are kept for clarity when a
  // callsite wants to be explicit.
  CMS_HOME_UPDATED: "CMS_HOME_UPDATED",
  CMS_PUBLIC_LINKS_UPDATED: "CMS_PUBLIC_LINKS_UPDATED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditInput {
  actorId?: string | null;
  actorEmail?: string | null;
  action: AuditAction | string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
}

/**
 * Write an AuditEvent row. Best-effort: errors are caught and logged so
 * audit failures cannot break the primary transaction.
 *
 * Accepts either the module-level `prisma` singleton or a Prisma transaction
 * client so callers can audit inside $transaction without leaking writes.
 */
export async function logAudit(
  input: AuditInput,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  try {
    await client.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        payload: input.payload
          ? (input.payload as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit event:", input.action, err);
  }
}