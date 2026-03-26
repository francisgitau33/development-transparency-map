import bcrypt from "bcrypt";
import { prisma } from "./prisma";
import { BRANDING } from "./branding";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: {
      role: true,
      organization: true,
      pendingRequest: true,
    },
  });
}

export async function createUser(
  email: string,
  password: string,
  displayName?: string
) {
  const normalizedEmail = email.toLowerCase().trim();
  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      password: hashedPassword,
      displayName: displayName?.trim() || null,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
    },
  });

  return user;
}

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      role: true,
      organization: true,
      pendingRequest: true,
    },
  });

  if (!user) return null;

  const isValid = await verifyPassword(password, user.password);
  if (!isValid) return null;

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    organizationId: user.organizationId,
    role: user.role,
    organization: user.organization,
    pendingRequest: user.pendingRequest,
    createdAt: user.createdAt,
  };
}

/**
 * Bootstrap system owner role for the designated email
 * This is the ONLY way to create a SYSTEM_OWNER role
 */
export async function bootstrapSystemOwner(userId: string, email: string) {
  if (email.toLowerCase() !== BRANDING.systemOwnerEmail.toLowerCase()) {
    return null;
  }

  const existingRole = await prisma.role.findUnique({
    where: { userId },
  });

  if (existingRole) {
    return existingRole;
  }

  return prisma.role.create({
    data: {
      userId,
      email: email.toLowerCase(),
      role: "SYSTEM_OWNER",
      organizationId: null,
    },
  });
}

/**
 * Create a pending access request for new users
 */
export async function createPendingAccessRequest(
  userId: string,
  email: string,
  displayName?: string | null,
  organizationName?: string | null
) {
  const existing = await prisma.pendingAccessRequest.findUnique({
    where: { userId },
  });

  if (existing) {
    return existing;
  }

  return prisma.pendingAccessRequest.create({
    data: {
      userId,
      email: email.toLowerCase(),
      displayName: displayName || null,
      organizationName: organizationName || null,
      status: "PENDING",
    },
  });
}

/**
 * Get user's authorization state
 */
export async function getUserAuthState(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: true,
      organization: true,
      pendingRequest: true,
    },
  });

  if (!user) {
    return { type: "NOT_FOUND" as const };
  }

  if (user.role) {
    return {
      type: "APPROVED" as const,
      role: user.role.role,
      organizationId: user.role.organizationId,
      organization: user.organization,
    };
  }

  if (user.pendingRequest) {
    return {
      type: "PENDING" as const,
      status: user.pendingRequest.status,
      requestedAt: user.pendingRequest.requestedAt,
    };
  }

  return { type: "NO_ACCESS" as const };
}