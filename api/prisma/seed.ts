// prisma/seed.ts
//
// Run via `npm run prisma:seed`. Populates just enough data to manually
// exercise every flow (search with filters, book, hit a conflict, view
// utilisation as an admin) without needing to create everything by hand
// through the API first.
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding...');

  // A fixed, low cost factor here (not env.BCRYPT_SALT_ROUNDS) is fine -
  // seed data is dev-only, never production credentials.
  const adminPasswordHash = await bcrypt.hash('AdminPass123', 10);
  const userPasswordHash = await bcrypt.hash('UserPass123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', passwordHash: adminPasswordHash, role: 'ADMIN' },
  });

  await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: { email: 'user@example.com', passwordHash: userPasswordHash, role: 'USER' },
  });

  const [projector, videoConf, whiteboard] = await Promise.all([
    prisma.attribute.upsert({ where: { name: 'projector' }, update: {}, create: { name: 'projector' } }),
    prisma.attribute.upsert({ where: { name: 'video_conferencing' }, update: {}, create: { name: 'video_conferencing' } }),
    prisma.attribute.upsert({ where: { name: 'whiteboard' }, update: {}, create: { name: 'whiteboard' } }),
  ]);

  const existingRooms = await prisma.room.count();
  if (existingRooms === 0) {
    const sunflower = await prisma.room.create({
      data: { name: 'Sunflower', floor: 1, capacity: 4 },
    });
    await prisma.roomAttribute.createMany({
      data: [{ roomId: sunflower.id, attributeId: whiteboard.id }],
    });

    const oak = await prisma.room.create({
      data: { name: 'Oak', floor: 2, capacity: 10 },
    });
    await prisma.roomAttribute.createMany({
      data: [
        { roomId: oak.id, attributeId: projector.id },
        { roomId: oak.id, attributeId: videoConf.id },
      ],
    });

    const cedar = await prisma.room.create({
      data: { name: 'Cedar', floor: 2, capacity: 20 },
    });
    await prisma.roomAttribute.createMany({
      data: [
        { roomId: cedar.id, attributeId: projector.id },
        { roomId: cedar.id, attributeId: whiteboard.id },
      ],
    });

    console.log('Created rooms: Sunflower, Oak, Cedar');
  }

  console.log(`Seed complete. Admin: admin@example.com / AdminPass123, User: user@example.com / UserPass123`);
  console.log(`(admin id: ${admin.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
