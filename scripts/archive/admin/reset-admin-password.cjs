// 仅重置 admin 密码（不重跑 seed，不碰分类/商品等其他数据）
// seed.ts 的 admin upsert 是 update:{}，已存在的 admin 密码不会被覆盖，所以需要本脚本。
// 用法（在 server 目录）：
//   $env:BOOTSTRAP_ADMIN_PASSWORD='你的新密码'
//   node reset-admin-password.cjs
// 密码只在你本机环境变量，不进对话/不进 Git。
// ⚠️ 本脚本连接的库 = server/.env 的 DATABASE_URL（与后端同库）。改密码也是写库——
//    若 .env 连的是生产库，会改变生产 admin 的登录密码！先确认是开发库。
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

(async () => {
  const pwd = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!pwd) {
    console.error('请先设置 $env:BOOTSTRAP_ADMIN_PASSWORD（新密码）');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
    if (!admin) {
      console.error('未找到 username=admin 的用户。先跑 `npx prisma db seed` 创建 admin，再跑本脚本。');
      process.exit(1);
    }
    const hash = await bcrypt.hash(pwd, 10); // 与 seed.ts 一致：10 rounds
    await prisma.user.update({ where: { id: admin.id }, data: { password: hash } });
    console.log(`✓ admin 密码已重置（userId=${admin.id}, username=admin, role=${admin.role}）`);
    console.log('  原密码已失效，请用新密码登录。');
  } catch (e) {
    console.error('重置失败:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
