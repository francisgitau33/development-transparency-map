import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { resolveSystemOwnerEmail } from "./seed-helpers";

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
 * - SYSTEM_OWNER_EMAIL    — REQUIRED. Email for the initial system owner.
 *   There is intentionally no default so that no personal email is ever
 *   baked into a production seed.
 * - SYSTEM_OWNER_PASSWORD — REQUIRED for first setup. If omitted the seed
 *   logs a clear message and skips user creation (other seed steps such
 *   as reference data still run).
 *
 * This step is idempotent — running multiple times will:
 * - Skip user creation if email already exists
 * - Update/create role if user exists but role is missing
 *
 * Example (local dev):
 *   SYSTEM_OWNER_EMAIL=owner@example.org \
 *   SYSTEM_OWNER_PASSWORD=ChangeMe123! \
 *     npx prisma db seed
 *
 * The only valid roles the seed assigns are SYSTEM_OWNER and
 * PARTNER_ADMIN (PARTNER_ADMIN is assigned elsewhere).
 *
 * The `resolveSystemOwnerEmail` helper lives in `./seed-helpers` so it
 * is unit-testable without instantiating `PrismaClient`.
 */
async function seedSystemOwner() {
  const systemOwnerEmail = resolveSystemOwnerEmail();
  const systemOwnerPassword = process.env.SYSTEM_OWNER_PASSWORD;

  if (!systemOwnerPassword) {
    console.log("⚠️  SYSTEM_OWNER_PASSWORD not set - skipping system owner creation");
    console.log(
      "   To create initial admin, run with: SYSTEM_OWNER_EMAIL=owner@example.org " +
        "SYSTEM_OWNER_PASSWORD=yourpassword npx prisma db seed",
    );
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

  // Seed reference administrative areas. Covers at least two countries with
  // 3+ districts/counties each so dev flows (form dropdowns, filters, reports)
  // are exercised against real data.
  // Mock population figures below are approximate, clearly labelled as
  // demonstration values, and must NOT be treated as official statistics.
  // They are deliberately rounded to three significant figures so they
  // clearly read as development mock data, not census-derived.
  // A handful of areas intentionally omit population fields so the
  // "Population data missing" code paths exercise real data.
  const MOCK_POP_SOURCE = "Development Transparency Map mock data (non-official)";
  const administrativeAreas: Array<{
    countryCode: string;
    name: string;
    type: string;
    sortOrder: number;
    estimatedPopulation?: number;
    populationYear?: number;
    populationSource?: string;
    populationSourceUrl?: string | null;
    populationNotes?: string;
  }> = [
    // Kenya — counties
    {
      countryCode: "KE",
      name: "Nairobi County",
      type: "County",
      sortOrder: 1,
      estimatedPopulation: 4_400_000,
      populationYear: 2019,
      populationSource: MOCK_POP_SOURCE,
      populationNotes: "Mock value for demonstration only.",
    },
    {
      countryCode: "KE",
      name: "Kisumu County",
      type: "County",
      sortOrder: 2,
      estimatedPopulation: 1_160_000,
      populationYear: 2019,
      populationSource: MOCK_POP_SOURCE,
      populationNotes: "Mock value for demonstration only.",
    },
    {
      countryCode: "KE",
      name: "Mombasa County",
      type: "County",
      sortOrder: 3,
      estimatedPopulation: 1_210_000,
      populationYear: 2019,
      populationSource: MOCK_POP_SOURCE,
      populationNotes: "Mock value for demonstration only.",
    },
    {
      countryCode: "KE",
      name: "Turkana County",
      type: "County",
      sortOrder: 4,
      estimatedPopulation: 926_000,
      populationYear: 2019,
      populationSource: MOCK_POP_SOURCE,
      populationNotes: "Mock value for demonstration only.",
    },
    // Uganda — districts. Kampala has a mock population; the other two
    // are intentionally left blank so the "Population data missing"
    // paths exercise real production-like data gaps.
    {
      countryCode: "UG",
      name: "Kampala District",
      type: "District",
      sortOrder: 1,
      estimatedPopulation: 1_680_000,
      populationYear: 2020,
      populationSource: MOCK_POP_SOURCE,
      populationNotes: "Mock value for demonstration only.",
    },
    { countryCode: "UG", name: "Gulu District", type: "District", sortOrder: 2 },
    { countryCode: "UG", name: "Mbarara District", type: "District", sortOrder: 3 },
    // Tanzania — regions
    {
      countryCode: "TZ",
      name: "Dar es Salaam Region",
      type: "Region",
      sortOrder: 1,
      estimatedPopulation: 5_380_000,
      populationYear: 2022,
      populationSource: MOCK_POP_SOURCE,
      populationNotes: "Mock value for demonstration only.",
    },
    {
      countryCode: "TZ",
      name: "Arusha Region",
      type: "Region",
      sortOrder: 2,
      estimatedPopulation: 2_060_000,
      populationYear: 2022,
      populationSource: MOCK_POP_SOURCE,
      populationNotes: "Mock value for demonstration only.",
    },
    {
      countryCode: "TZ",
      name: "Mwanza Region",
      type: "Region",
      sortOrder: 3,
      estimatedPopulation: 3_700_000,
      populationYear: 2022,
      populationSource: MOCK_POP_SOURCE,
      populationNotes: "Mock value for demonstration only.",
    },
  ];

  for (const area of administrativeAreas) {
    // IMPORTANT: we use `update: {}` so re-seeding never stomps over
    // population fields an operator has maintained via the CMS.
    const {
      countryCode,
      name,
      type,
      sortOrder,
      estimatedPopulation,
      populationYear,
      populationSource,
      populationSourceUrl,
      populationNotes,
    } = area;
    await prisma.administrativeArea.upsert({
      where: {
        countryCode_name: {
          countryCode,
          name,
        },
      },
      update: {},
      create: {
        countryCode,
        name,
        type,
        sortOrder,
        estimatedPopulation: estimatedPopulation ?? null,
        populationYear: populationYear ?? null,
        populationSource: populationSource ?? null,
        populationSourceUrl: populationSourceUrl ?? null,
        populationNotes: populationNotes ?? null,
      },
    });
  }
  console.log(`Seeded ${administrativeAreas.length} administrative areas`);

  // Seed reference donors. The names mirror the PRD-level examples across
  // donor types (Bilateral, Multilateral, Foundation, Corporate, Government).
  const donors = [
    {
      name: "USAID",
      donorType: "Bilateral",
      countryOfOrigin: "US",
      website: "https://www.usaid.gov",
      sortOrder: 1,
    },
    {
      name: "FCDO (UK)",
      donorType: "Bilateral",
      countryOfOrigin: "GB",
      website: "https://www.gov.uk/government/organisations/foreign-commonwealth-development-office",
      sortOrder: 2,
    },
    {
      name: "World Bank",
      donorType: "Multilateral",
      countryOfOrigin: null,
      website: "https://www.worldbank.org",
      sortOrder: 3,
    },
    {
      name: "Bill & Melinda Gates Foundation",
      donorType: "Foundation",
      countryOfOrigin: "US",
      website: "https://www.gatesfoundation.org",
      sortOrder: 4,
    },
    {
      name: "European Union",
      donorType: "Multilateral",
      countryOfOrigin: null,
      website: "https://international-partnerships.ec.europa.eu",
      sortOrder: 5,
    },
    {
      name: "Global Fund",
      donorType: "Pooled Fund",
      countryOfOrigin: null,
      website: "https://www.theglobalfund.org",
      sortOrder: 6,
    },
  ];

  for (const donor of donors) {
    await prisma.donor.upsert({
      where: { name: donor.name },
      update: {},
      create: donor,
    });
  }
  console.log(`Seeded ${donors.length} donors`);

  // ---------------------------------------------------------------------
  // Country Development Context indicators (Prompt 8)
  //
  // IMPORTANT — values below are mock demonstration data. They roughly
  // track order-of-magnitude estimates from common open sources but are
  // deliberately rounded so they clearly read as non-official. Source
  // labels are set to a clearly non-official string and mirrored in
  // notes. They must NOT be presented as authoritative statistics.
  //
  // Only a subset of seeded countries has indicator data so the "missing
  // indicator" UI code paths (Data Quality / Reports) see live data in
  // development. Upserts are keyed on (countryCode, indicatorKey, year)
  // and use `update: {}` so re-seeding never stomps values a System
  // Owner has corrected via the CMS.
  // ---------------------------------------------------------------------
  const MOCK_INDICATOR_SOURCE =
    "Development Transparency Map mock data (non-official)";
  const MOCK_INDICATOR_NOTES = "Mock value for demonstration only.";

  type MockIndicatorRow = {
    countryCode: string;
    indicatorKey:
      | "GDP_PER_CAPITA_CURRENT_USD"
      | "HDI_SCORE"
      | "HDI_RANK"
      | "POVERTY_RATE"
      | "ODA_RECEIVED_PER_CAPITA"
      | "ODA_AS_PERCENT_GNI";
    year: number;
    value: number | null;
    rank?: number | null;
    unit: string | null;
  };

  const mockIndicators: MockIndicatorRow[] = [
    // Kenya ------------------------------------------------------------
    { countryCode: "KE", indicatorKey: "GDP_PER_CAPITA_CURRENT_USD", year: 2021, value: 2040, unit: "USD" },
    { countryCode: "KE", indicatorKey: "GDP_PER_CAPITA_CURRENT_USD", year: 2022, value: 2100, unit: "USD" },
    { countryCode: "KE", indicatorKey: "GDP_PER_CAPITA_CURRENT_USD", year: 2023, value: 2170, unit: "USD" },
    { countryCode: "KE", indicatorKey: "HDI_SCORE", year: 2021, value: 0.575, unit: null },
    { countryCode: "KE", indicatorKey: "HDI_SCORE", year: 2022, value: 0.601, unit: null },
    { countryCode: "KE", indicatorKey: "HDI_RANK", year: 2022, value: null, rank: 152, unit: null },
    { countryCode: "KE", indicatorKey: "POVERTY_RATE", year: 2021, value: 36.1, unit: "%" },
    { countryCode: "KE", indicatorKey: "POVERTY_RATE", year: 2022, value: 34.5, unit: "%" },
    { countryCode: "KE", indicatorKey: "ODA_AS_PERCENT_GNI", year: 2022, value: 3.1, unit: "%" },
    { countryCode: "KE", indicatorKey: "ODA_RECEIVED_PER_CAPITA", year: 2022, value: 61, unit: "USD" },

    // Uganda -----------------------------------------------------------
    { countryCode: "UG", indicatorKey: "GDP_PER_CAPITA_CURRENT_USD", year: 2021, value: 900, unit: "USD" },
    { countryCode: "UG", indicatorKey: "GDP_PER_CAPITA_CURRENT_USD", year: 2022, value: 950, unit: "USD" },
    { countryCode: "UG", indicatorKey: "GDP_PER_CAPITA_CURRENT_USD", year: 2023, value: 1000, unit: "USD" },
    { countryCode: "UG", indicatorKey: "HDI_SCORE", year: 2022, value: 0.55, unit: null },
    { countryCode: "UG", indicatorKey: "HDI_RANK", year: 2022, value: null, rank: 166, unit: null },
    { countryCode: "UG", indicatorKey: "POVERTY_RATE", year: 2022, value: 30.0, unit: "%" },
    { countryCode: "UG", indicatorKey: "ODA_AS_PERCENT_GNI", year: 2022, value: 5.8, unit: "%" },

    // Tanzania ---------------------------------------------------------
    { countryCode: "TZ", indicatorKey: "GDP_PER_CAPITA_CURRENT_USD", year: 2021, value: 1150, unit: "USD" },
    { countryCode: "TZ", indicatorKey: "GDP_PER_CAPITA_CURRENT_USD", year: 2022, value: 1200, unit: "USD" },
    { countryCode: "TZ", indicatorKey: "GDP_PER_CAPITA_CURRENT_USD", year: 2023, value: 1260, unit: "USD" },
    { countryCode: "TZ", indicatorKey: "HDI_SCORE", year: 2022, value: 0.532, unit: null },
    { countryCode: "TZ", indicatorKey: "HDI_RANK", year: 2022, value: null, rank: 160, unit: null },
    { countryCode: "TZ", indicatorKey: "POVERTY_RATE", year: 2022, value: 26.4, unit: "%" },
    { countryCode: "TZ", indicatorKey: "ODA_RECEIVED_PER_CAPITA", year: 2022, value: 44, unit: "USD" },
  ];

  for (const ind of mockIndicators) {
    await prisma.countryIndicator.upsert({
      where: {
        countryCode_indicatorKey_year: {
          countryCode: ind.countryCode,
          indicatorKey: ind.indicatorKey,
          year: ind.year,
        },
      },
      update: {},
      create: {
        countryCode: ind.countryCode,
        indicatorKey: ind.indicatorKey,
        year: ind.year,
        value: ind.value,
        rank: ind.rank ?? null,
        unit: ind.unit,
        source: MOCK_INDICATOR_SOURCE,
        sourceUrl: null,
        notes: MOCK_INDICATOR_NOTES,
      },
    });
  }
  console.log(`Seeded ${mockIndicators.length} mock country indicators`);

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