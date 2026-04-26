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
  PROJECT_CREATED: "PROJECT_CREATED",
  PROJECT_UPDATED: "PROJECT_UPDATED",
  PROJECT_DELETED: "PROJECT_DELETED",
  PROJECT_VISIBILITY_CHANGED: "PROJECT_VISIBILITY_CHANGED",
  UPLOAD_COMPLETED: "UPLOAD_COMPLETED",
  CMS_UPDATED: "CMS_UPDATED",
  SYSTEM_OWNER_SEED_VERIFIED: "SYSTEM_OWNER_SEED_VERIFIED",
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