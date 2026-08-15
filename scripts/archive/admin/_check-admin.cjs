const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const u = await p.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true, username: true, role: true, status: true },
    });
    console.log('SUPER_ADMIN 当前:', JSON.stringify(u));
  } catch (e) {
    console.error('查询失败:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
