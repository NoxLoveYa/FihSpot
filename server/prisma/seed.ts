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
    { name: 'Vieux Port', description: 'Quartier historique au bord de la mer.', category: 'culture', lat: 43.2951, lng: 5.3736 },
    { name: 'Calanque de Sugiton', description: 'Randonnée et baignade dans les calanques.', category: 'nature', lat: 43.2147, lng: 5.4355 },
    { name: 'Restaurant Chez Michel', description: 'Bouillabaisse de référence.', category: 'food', lat: 43.2986, lng: 5.3711 },
    { name: 'Notre-Dame de la Garde', description: 'Point de vue panoramique sur la ville.', category: 'culture', lat: 43.284, lng: 5.3712 },
    { name: 'Plage du Prado', description: 'Grande plage urbaine, idéale au coucher du soleil.', category: 'nature', lat: 43.2546, lng: 5.3725 },
  ];

  await prisma.poI.deleteMany({ where: { createdById: demo.id } });

  for (const poi of samplePois) {
    await prisma.poI.create({ data: { ...poi, createdById: demo.id } });
  }

  console.log('Seed terminé ✓');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
