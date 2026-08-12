import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

async function main() {
  const demoEmail = 'demo@fihspot.app';
  const passwordHash = await hashPassword('demo1234');

  const demo = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {},
    create: { email: demoEmail, name: 'Demo', passwordHash },
  });

  const samplePois = [
    { name: 'Old Port', description: 'Historic waterfront quarter.', category: 'culture', lat: 43.2951, lng: 5.3736 },
    { name: 'Sugiton Cove', description: 'Hiking and swimming in the calanques.', category: 'nature', lat: 43.2147, lng: 5.4355 },
    { name: 'Chez Michel Restaurant', description: 'A reference for bouillabaisse.', category: 'food', lat: 43.2986, lng: 5.3711 },
    { name: 'Notre-Dame de la Garde', description: 'Panoramic viewpoint over the city.', category: 'culture', lat: 43.284, lng: 5.3712 },
    { name: 'Prado Beach', description: 'Large urban beach, ideal at sunset.', category: 'nature', lat: 43.2546, lng: 5.3725 },
  ].map((poi) => ({ ...poi, demo: true }));

  await prisma.poI.deleteMany({ where: { createdById: demo.id } });

  for (const poi of samplePois) {
    await prisma.poI.create({ data: { ...poi, createdById: demo.id } });
  }

  console.log('Seed completed ✓');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
