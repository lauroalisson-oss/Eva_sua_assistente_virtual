const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  console.log('Running production seed...');
  const phone = process.env.AUTHORIZED_PHONES ? process.env.AUTHORIZED_PHONES.split(',')[0].trim() : '5575987107746';
  const existing = await prisma.tenant.findUnique({ where: { phone } });
  if (existing) { console.log('Tenant already exists: ' + existing.name); return; }
  const tenant = await prisma.tenant.create({
    data: { name: 'Lauro Alisson', phone, email: 'lauro.alisson@gmail.com', plan: 'PROFESSIONAL', timezone: process.env.DEFAULT_TIMEZONE || 'America/Bahia', settings: JSON.stringify({ dailySummaryHour: parseInt(process.env.DAILY_SUMMARY_HOUR || '7'), remindersBefore: [60, 1440], language: 'pt-BR' }) }
  });
  console.log('Tenant created: ' + tenant.name);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
