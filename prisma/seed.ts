import type { UserRole } from "@/generated/prisma/client";
import { BodyOfWaterType, VisitStatus } from "@/generated/prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

const DEMO_PUBLIC_SLUG = "demo-public-slug";

type SeedAuthSpec = { email: string; role: UserRole; name: string };

const AUTH_SPECS: SeedAuthSpec[] = [
  { email: "pool-admin@example.com", role: "ADMIN", name: "Pool Admin" },
  { email: "pool-office@example.com", role: "OFFICE", name: "Pool Office" },
  { email: "pool-tech@example.com", role: "TECHNICIAN", name: "Pool Tech" },
];

async function resolveAuthUserId(
  supabaseAdmin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!created.error && created.data.user?.id) {
    return created.data.user.id;
  }

  const msg = created.error?.message ?? "";
  if (!msg.toLowerCase().includes("already")) {
    throw new Error(`Supabase createUser failed for ${email}: ${msg || "unknown error"}`);
  }

  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 10; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found?.id) return found.id;
    if (data.users.length < perPage) break;
    page += 1;
  }

  throw new Error(`User ${email} exists in Supabase but could not be listed — check dashboard or increase seed pagination.`);
}

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "seed-org-aquarunner" },
    create: { id: "seed-org-aquarunner", name: "AquaRunner (seed)" },
    update: { name: "AquaRunner (seed)" },
  });

  const customer = await prisma.customer.upsert({
    where: { id: "seed-customer-1" },
    create: {
      id: "seed-customer-1",
      organizationId: org.id,
      name: "Demo Management Co.",
      notes: "Seeded customer",
    },
    update: { name: "Demo Management Co." },
  });

  const property = await prisma.property.upsert({
    where: { id: "seed-property-1" },
    create: {
      id: "seed-property-1",
      organizationId: org.id,
      customerId: customer.id,
      name: "Demo Commercial Pool Site",
      city: "Las Vegas",
      region: "NV",
      country: "US",
      managerName: "Site Manager",
      managerBusinessPhone: "702-555-1000",
      managerMobilePhone: "702-555-1001",
      managerPhone: "702-555-1000 | 702-555-1001",
      managerEmail: "manager@example.com",
    },
    update: {
      name: "Demo Commercial Pool Site",
      managerName: "Site Manager",
      managerBusinessPhone: "702-555-1000",
      managerMobilePhone: "702-555-1001",
      managerPhone: "702-555-1000 | 702-555-1001",
      managerEmail: "manager@example.com",
    },
  });

  const body = await prisma.bodyOfWater.upsert({
    where: { id: "seed-body-1" },
    create: {
      id: "seed-body-1",
      propertyId: property.id,
      name: "Main Pool",
      type: BodyOfWaterType.POOL,
      volumeGallons: 85000,
      minimumRequiredFlowGpm: 200,
      maximumFilterFlowGpm: 400,
      publicSlug: DEMO_PUBLIC_SLUG,
    },
    update: {
      name: "Main Pool",
      minimumRequiredFlowGpm: 200,
      maximumFilterFlowGpm: 400,
      publicSlug: DEMO_PUBLIC_SLUG,
    },
  });

  await prisma.bodyOfWaterServiceWeekday.deleteMany({ where: { bodyOfWaterId: body.id } });
  await prisma.bodyOfWaterServiceWeekday.createMany({
    data: [1, 3, 5].map((weekday) => ({ bodyOfWaterId: body.id, weekday })),
  });

  await prisma.equipment.upsert({
    where: { id: "seed-equipment-pump" },
    create: {
      id: "seed-equipment-pump",
      bodyOfWaterId: body.id,
      kind: "PUMP",
      make: "Example",
      model: "XP-200",
      serialNumber: "SN-DEMO-001",
    },
    update: { make: "Example", model: "XP-200" },
  });

  const start = new Date();
  start.setHours(9, 0, 0, 0);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const seedPassword = process.env.SEED_DEV_PASSWORD;

  if (!url || !serviceKey || !seedPassword) {
    console.log("\n[seed] Skipping Supabase Auth user creation.");
    console.log("[seed] Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SEED_DEV_PASSWORD to create login accounts.");
    console.log("[seed] Sample data (org, property, body, weekdays, visit) is in the database.\n");
    await ensurePrismaUsersWithoutAuth(org.id);
  }

  const techPrismaUser = await prisma.user.findUnique({
    where: { email: "pool-tech@example.com" },
  });

  const completedAt = new Date(start);
  completedAt.setHours(completedAt.getHours() + 1);

  // Recreate the demo visit every seed run so the public QR page always has something to show.
  await prisma.serviceVisit.deleteMany({ where: { id: "seed-visit-1" } });
  await prisma.serviceVisit.deleteMany({ where: { id: "seed-visit-live-1" } });

  await prisma.serviceVisit.create({
    data: {
      id: "seed-visit-1",
      organizationId: org.id,
      propertyId: property.id,
      bodyOfWaterId: body.id,
      technicianId: techPrismaUser?.id ?? null,
      scheduledStart: start,
      startedAt: start,
      completedAt,

      status: VisitStatus.COMPLETED,
      serviceComplete: true,

      techNotes: "Seeded demo visit (SNHD-friendly log layout).",

      reading: {
        create: {
          capturedAt: completedAt,
          ph: 7.4,
          freeChlorinePpm: 2.5,
          totalChlorinePpm: 2.6,
          alkalinityPpm: 80,
          cyanuricAcidPpm: 50,

          pumpPressurePsi: 28,
          vacGaugeReading: 4,
          flowMeterGpm: 320,
          filterPressurePsi: 18,
          filterGaugeReading: 20,

          backwashAt: completedAt,
        },
      },

      doses: {
        create: [
          {
            productName: "Sodium Hypochlorite",
            quantity: 8,
            unit: "gal",
          },
          {
            productName: "Alkalinity Up",
            quantity: 6,
            unit: "lb",
          },
        ],
      },

      // For now, we only store metadata in the DB (no actual file upload yet).
      // Technician photo upload will generate real storage objects later.
      photos: {
        create: [
          {
            storagePath: "seed-photo/demo-main-pool.jpg",
            contentType: "image/jpeg",
            takenAt: completedAt,
          },
        ],
      },

      issues: {
        create: [
          {
            code: "NONE",
            description: "No issues detected.",
            severity: "LOW",
          },
        ],
      },
    },
  });

  await prisma.serviceVisit.create({
    data: {
      id: "seed-visit-live-1",
      organizationId: org.id,
      propertyId: property.id,
      bodyOfWaterId: body.id,
      technicianId: techPrismaUser?.id ?? null,
      scheduledStart: start,
      status: VisitStatus.IN_PROGRESS,
      serviceComplete: false,
      techNotes: "Live demo visit for technician form testing.",
    },
  });

  if (!url || !serviceKey || !seedPassword) {
    return;
  }

  const supabaseAdmin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const spec of AUTH_SPECS) {
    const authUserId = await resolveAuthUserId(supabaseAdmin, spec.email, seedPassword);
    await prisma.user.upsert({
      where: { email: spec.email },
      create: {
        organizationId: org.id,
        email: spec.email,
        name: spec.name,
        role: spec.role,
        authUserId,
      },
      update: {
        name: spec.name,
        role: spec.role,
        authUserId,
      },
    });
    console.log(`[seed] Linked ${spec.email} → Supabase auth id`);
  }

  const tech = await prisma.user.findUnique({ where: { email: "pool-tech@example.com" } });
  if (tech) {
    await prisma.serviceVisit.updateMany({
      where: { id: { in: ["seed-visit-1", "seed-visit-live-1"] } },
      data: { technicianId: tech.id },
    });
  }

  console.log("\n[seed] Done. Sign in at /login with:");
  console.log(`[seed]   ${AUTH_SPECS.map((s) => s.email).join(", ")}`);
  console.log(`[seed]   Password: (value of SEED_DEV_PASSWORD)\n`);
}

/** Create Prisma User rows without auth ids if auth seed was skipped */
async function ensurePrismaUsersWithoutAuth(organizationId: string) {
  const specs = AUTH_SPECS;
  for (const spec of specs) {
    await prisma.user.upsert({
      where: { email: spec.email },
      create: {
        organizationId,
        email: spec.email,
        name: spec.name,
        role: spec.role,
      },
      update: {
        name: spec.name,
        role: spec.role,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
