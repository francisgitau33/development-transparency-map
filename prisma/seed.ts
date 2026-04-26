import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function recordSeedAudit(
  action: string,
  actorId: string | null,
  actorEmail: string | null,
  entityType: string | null,
  entityId: string | null,
  payload: Record<string, unknown> | null,
) {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId,
        actorEmail,
        action,
        entityType,
        entityId,
        payload: payload
          ? (payload as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.error("[seed:audit]", action, err);
  }
}

/**
 * SYSTEM_OWNER SEEDING
 * 
 * Environment Variables Required:
 * - SYSTEM_OWNER_EMAIL: Email for the initial system owner (defaults to branding config)
 * - SYSTEM_OWNER_PASSWORD: Initial password for the system owner (REQUIRED for first setup)
 * 
 * This is idempotent - running multiple times will:
 * - Skip user creation if email already exists
 * - Update/create role if user exists but role is missing
 */
async function seedSystemOwner() {
  const systemOwnerEmail = process.env.SYSTEM_OWNER_EMAIL || "theforestforthetrees23@gmail.com";
  const systemOwnerPassword = process.env.SYSTEM_OWNER_PASSWORD;

  if (!systemOwnerPassword) {
    console.log("⚠️  SYSTEM_OWNER_PASSWORD not set - skipping system owner creation");
    console.log("   To create initial admin, run with: SYSTEM_OWNER_PASSWORD=yourpassword npx prisma db seed");
    return;
  }

  console.log(`Setting up SYSTEM_OWNER: ${systemOwnerEmail}`);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: systemOwnerEmail },
    include: { role: true },
  });

  if (existingUser) {
    // User exists - check if role exists
    if (existingUser.role) {
      console.log(`✓ SYSTEM_OWNER already exists with role: ${existingUser.role.role}`);
      await recordSeedAudit(
        "SYSTEM_OWNER_SEED_VERIFIED",
        existingUser.id,
        existingUser.email,
        "User",
        existingUser.id,
        { outcome: "already_exists", role: existingUser.role.role },
      );
      return;
    }

    // User exists but no role - add role
    console.log(`User exists but missing role - adding SYSTEM_OWNER role...`);
    await prisma.role.create({
      data: {
        userId: existingUser.id,
        email: existingUser.email,
        role: "SYSTEM_OWNER",
        organizationId: null,
      },
    });
    console.log(`✓ SYSTEM_OWNER role added to existing user`);
    await recordSeedAudit(
      "SYSTEM_OWNER_SEED_VERIFIED",
      existingUser.id,
      existingUser.email,
      "User",
      existingUser.id,
      { outcome: "role_added" },
    );
    return;
  }

  // Create new user with role
  const hashedPassword = await bcrypt.hash(systemOwnerPassword, 10);

  const user = await prisma.user.create({
    data: {
      email: systemOwnerEmail,
      password: hashedPassword,
      displayName: "System Owner",
    },
  });

  await prisma.role.create({
    data: {
      userId: user.id,
      email: user.email,
      role: "SYSTEM_OWNER",
      organizationId: null,
    },
  });

  console.log(`✓ SYSTEM_OWNER created: ${systemOwnerEmail}`);
  console.log(`  IMPORTANT: Change this password after first login!`);

  await recordSeedAudit(
    "SYSTEM_OWNER_SEED_VERIFIED",
    user.id,
    user.email,
    "User",
    user.id,
    { outcome: "created" },
  );
}

async function main() {
  console.log("Seeding database...");

  // Seed SYSTEM_OWNER first
  await seedSystemOwner();

  // Seed reference countries
  const countries = [
    { code: "US", name: "United States", type: "COUNTRY" as const, sortOrder: 1 },
    { code: "GB", name: "United Kingdom", type: "COUNTRY" as const, sortOrder: 2 },
    { code: "KE", name: "Kenya", type: "COUNTRY" as const, sortOrder: 3 },
    { code: "NG", name: "Nigeria", type: "COUNTRY" as const, sortOrder: 4 },
    { code: "IN", name: "India", type: "COUNTRY" as const, sortOrder: 5 },
    { code: "BD", name: "Bangladesh", type: "COUNTRY" as const, sortOrder: 6 },
    { code: "PH", name: "Philippines", type: "COUNTRY" as const, sortOrder: 7 },
    { code: "BR", name: "Brazil", type: "COUNTRY" as const, sortOrder: 8 },
    { code: "MX", name: "Mexico", type: "COUNTRY" as const, sortOrder: 9 },
    { code: "ZA", name: "South Africa", type: "COUNTRY" as const, sortOrder: 10 },
    { code: "ET", name: "Ethiopia", type: "COUNTRY" as const, sortOrder: 11 },
    { code: "GH", name: "Ghana", type: "COUNTRY" as const, sortOrder: 12 },
    { code: "UG", name: "Uganda", type: "COUNTRY" as const, sortOrder: 13 },
    { code: "TZ", name: "Tanzania", type: "COUNTRY" as const, sortOrder: 14 },
    { code: "RW", name: "Rwanda", type: "COUNTRY" as const, sortOrder: 15 },
    { code: "NP", name: "Nepal", type: "COUNTRY" as const, sortOrder: 16 },
    { code: "MM", name: "Myanmar", type: "COUNTRY" as const, sortOrder: 17 },
    { code: "VN", name: "Vietnam", type: "COUNTRY" as const, sortOrder: 18 },
    { code: "ID", name: "Indonesia", type: "COUNTRY" as const, sortOrder: 19 },
    { code: "PK", name: "Pakistan", type: "COUNTRY" as const, sortOrder: 20 },
  ];

  for (const country of countries) {
    await prisma.referenceCountry.upsert({
      where: { code: country.code },
      update: {},
      create: country,
    });
  }
  console.log(`Seeded ${countries.length} countries`);

  // Seed reference sectors
  const sectors = [
    { key: "HEALTH", name: "Health", icon: "heart", color: "#ef4444", sortOrder: 1 },
    { key: "EDUCATION", name: "Education", icon: "book-open", color: "#3b82f6", sortOrder: 2 },
    { key: "WASH", name: "Water & Sanitation", icon: "droplet", color: "#06b6d4", sortOrder: 3 },
    { key: "AGRICULTURE", name: "Agriculture", icon: "wheat", color: "#22c55e", sortOrder: 4 },
    { key: "INFRASTRUCTURE", name: "Infrastructure", icon: "building-2", color: "#6b7280", sortOrder: 5 },
    { key: "ENERGY", name: "Energy", icon: "zap", color: "#f59e0b", sortOrder: 6 },
    { key: "ENVIRONMENT", name: "Environment", icon: "leaf", color: "#10b981", sortOrder: 7 },
    { key: "GOVERNANCE", name: "Governance", icon: "landmark", color: "#8b5cf6", sortOrder: 8 },
    { key: "HUMANITARIAN", name: "Humanitarian Aid", icon: "heart-handshake", color: "#ec4899", sortOrder: 9 },
    { key: "ECONOMIC", name: "Economic Development", icon: "trending-up", color: "#14b8a6", sortOrder: 10 },
  ];

  for (const sector of sectors) {
    await prisma.referenceSector.upsert({
      where: { key: sector.key },
      update: {},
      create: sector,
    });
  }
  console.log(`Seeded ${sectors.length} sectors`);

  // Seed default CMS about content
  const existingAbout = await prisma.cmsAbout.findFirst();
  if (!existingAbout) {
    await prisma.cmsAbout.create({
      data: {
        title: "About Development Transparency Map",
        subtitle: "Mapping Development. Enabling Transparency.",
        bodySections: [
          {
            type: "text",
            content:
              "Development Transparency Map is a public geospatial platform that visualizes development projects worldwide, enabling transparency and accountability in the development sector.",
          },
          {
            type: "text",
            content:
              "Our mission is to make development data accessible to everyone, from researchers and policymakers to citizens and civil society organizations.",
          },
          {
            type: "text",
            content:
              "The platform allows approved partner organizations to contribute, manage, and update project information through a secure dashboard, ensuring data accuracy and governance.",
          },
        ],
      },
    });
    console.log("Seeded default CMS about content");
  }

  console.log("Seeding completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });