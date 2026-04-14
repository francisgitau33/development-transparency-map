import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// Organization definitions
const organizations = [
  {
    name: "Global Health Initiative",
    type: "INGO" as const,
    countryCode: "US",
    website: "https://globalhealthinitiative.org",
    contactEmail: "info@globalhealthinitiative.org",
    description: "International health organization focused on maternal health, HIV/AIDS prevention, and primary healthcare in East Africa.",
  },
  {
    name: "East Africa Education Foundation",
    type: "INGO" as const,
    countryCode: "GB",
    website: "https://eastafricaeducation.org",
    contactEmail: "info@eastafricaeducation.org",
    description: "UK-based foundation supporting education initiatives including school construction, digital learning, and teacher training.",
  },
  {
    name: "Clean Water Alliance",
    type: "INGO" as const,
    countryCode: "US",
    website: "https://cleanwateralliance.org",
    contactEmail: "info@cleanwateralliance.org",
    description: "WASH-focused organization providing clean water access and sanitation infrastructure across East Africa.",
  },
  {
    name: "AgriTech Development Partners",
    type: "FOUNDATION" as const,
    countryCode: "KE",
    website: "https://agritechpartners.org",
    contactEmail: "info@agritechpartners.org",
    description: "Agriculture technology foundation supporting smallholder farmers with climate-smart practices and post-harvest solutions.",
  },
  {
    name: "Renewable Energy Africa",
    type: "INGO" as const,
    countryCode: "NL",
    website: "https://renewableenergyafrica.org",
    contactEmail: "info@renewableenergyafrica.org",
    description: "Clean energy organization deploying solar mini-grids, biogas systems, and wind power across rural Africa.",
  },
  {
    name: "East African Infrastructure Fund",
    type: "FOUNDATION" as const,
    countryCode: "KE",
    website: "https://eainfrastructurefund.org",
    contactEmail: "info@eainfrastructurefund.org",
    description: "Regional infrastructure development fund supporting roads, markets, and public facilities.",
  },
  {
    name: "Community Governance Network",
    type: "LNGO" as const,
    countryCode: "TZ",
    website: "https://communitygovernance.org",
    contactEmail: "info@communitygovernance.org",
    description: "Local governance organization promoting transparency, citizen participation, and access to justice.",
  },
];

// Map email domains to organization names
const emailToOrg: Record<string, string> = {
  "globalhealthinitiative.org": "Global Health Initiative",
  "eastafricaeducation.org": "East Africa Education Foundation",
  "cleanwateralliance.org": "Clean Water Alliance",
  "agritechpartners.org": "AgriTech Development Partners",
  "renewableenergyafrica.org": "Renewable Energy Africa",
  "eainfrastructurefund.org": "East African Infrastructure Fund",
  "communitygovernance.org": "Community Governance Network",
};

async function main() {
  console.log("🌱 Seeding mock data...\n");

  // Get the SYSTEM_OWNER user to use as creator
  const systemOwner = await prisma.user.findFirst({
    where: {
      role: {
        role: "SYSTEM_OWNER",
      },
    },
  });

  if (!systemOwner) {
    console.error("❌ No SYSTEM_OWNER user found. Please run the main seed first.");
    process.exit(1);
  }

  console.log(`✓ Found SYSTEM_OWNER: ${systemOwner.email}\n`);

  // Create organizations
  console.log("📁 Creating organizations...");
  const orgMap: Record<string, string> = {};

  for (const org of organizations) {
    const existing = await prisma.organization.findFirst({
      where: { name: org.name },
    });

    if (existing) {
      console.log(`  ⏭️  Organization already exists: ${org.name}`);
      orgMap[org.name] = existing.id;
    } else {
      const created = await prisma.organization.create({
        data: org,
      });
      console.log(`  ✓ Created: ${org.name}`);
      orgMap[org.name] = created.id;
    }
  }

  console.log(`\n✓ ${Object.keys(orgMap).length} organizations ready\n`);

  // Read and parse CSV
  const csvPath = path.join(__dirname, "../../uploads/mock_project_data.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.trim().split("\n");
  const headers = parseCSVLine(lines[0]);

  console.log("📊 Importing projects...");
  let created = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });

    // Get organization from email domain
    const email = row.contactEmail;
    const domain = email.split("@")[1];
    const orgName = emailToOrg[domain];

    if (!orgName || !orgMap[orgName]) {
      console.log(`  ⚠️  Unknown organization for: ${row.title}`);
      skipped++;
      continue;
    }

    const organizationId = orgMap[orgName];

    // Check if project already exists
    const existing = await prisma.project.findFirst({
      where: {
        title: row.title,
        organizationId: organizationId,
      },
    });

    if (existing) {
      console.log(`  ⏭️  Already exists: ${row.title}`);
      skipped++;
      continue;
    }

    // Create project
    await prisma.project.create({
      data: {
        title: row.title,
        description: row.description,
        organizationId: organizationId,
        countryCode: row.countryCode,
        sectorKey: row.sectorKey,
        status: row.status as "ACTIVE" | "PLANNED" | "COMPLETED",
        startDate: new Date(row.startDate),
        endDate: row.endDate ? new Date(row.endDate) : null,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        budgetUsd: row.budgetUsd ? parseFloat(row.budgetUsd) : null,
        locationName: row.locationName || null,
        dataSource: row.dataSource || null,
        contactEmail: row.contactEmail || null,
        createdByUserId: systemOwner.id,
      },
    });

    console.log(`  ✓ Created: ${row.title}`);
    created++;
  }

  console.log(`\n✅ Import complete!`);
  console.log(`   Created: ${created} projects`);
  console.log(`   Skipped: ${skipped} projects`);

  // Summary
  const projectCount = await prisma.project.count();
  const orgCount = await prisma.organization.count();
  console.log(`\n📈 Database totals:`);
  console.log(`   Organizations: ${orgCount}`);
  console.log(`   Projects: ${projectCount}`);
}

// Parse CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });