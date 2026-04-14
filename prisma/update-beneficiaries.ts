import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Map project titles to appropriate beneficiary counts
const beneficiaryData: Record<string, number> = {
  // Health projects - based on description
  "Maternal Health Improvement Program": 75000,
  "HIV/AIDS Prevention & Treatment": 50000,
  "Kampala Urban Health Centers": 200000,
  "Malaria Elimination Initiative": 200000,
  
  // Education projects
  "Rural Primary Schools Construction": 6000,
  "Digital Learning Initiative": 15000,
  "Girls Education Empowerment": 2000,
  "Teacher Training Academy": 25000,
  
  // WASH projects
  "Mombasa Water Supply Expansion": 100000,
  "Rural Borehole Program": 150000,
  "Zanzibar Sanitation Improvement": 25000,
  "Lake Victoria Basin Water Quality": 200000,
  
  // Agriculture projects
  "Climate-Smart Agriculture Training": 5000,
  "Irrigation Systems Development": 12500,
  "Cashew Nut Processing Facility": 5000,
  "Post-Harvest Storage Program": 25000,
  
  // Energy projects
  "Solar Mini-Grid Network": 40000,
  "Biogas Digesters for Schools": 50000,
  "Wind Power Feasibility Study": 100000,
  
  // Infrastructure projects
  "Rural Road Rehabilitation": 200000,
  "Jinja-Kampala Highway Expansion": 500000,
  "Dodoma Public Market Complex": 50000,
  
  // Governance projects
  "Community Justice Centers": 100000,
  "Local Government Capacity Building": 500000,
  "Anti-Corruption Monitoring Platform": 1000000,
};

async function updateBeneficiaries() {
  console.log("🌱 Updating target beneficiaries for existing projects...\n");

  for (const [title, beneficiaries] of Object.entries(beneficiaryData)) {
    const result = await prisma.project.updateMany({
      where: { title },
      data: { targetBeneficiaries: beneficiaries },
    });

    if (result.count > 0) {
      console.log(`  ✓ ${title}: ${beneficiaries.toLocaleString()} beneficiaries`);
    }
  }

  // Summary
  const totalBeneficiaries = await prisma.project.aggregate({
    _sum: { targetBeneficiaries: true },
  });

  console.log(`\n✅ Update complete!`);
  console.log(`   Total target beneficiaries: ${(totalBeneficiaries._sum.targetBeneficiaries || 0).toLocaleString()}`);
}

updateBeneficiaries()
  .catch(console.error)
  .finally(() => prisma.$disconnect());