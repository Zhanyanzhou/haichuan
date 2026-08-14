// 重置超级管理员凭据（用户名 + 密码）。按 role=SUPER_ADMIN 定位，不依赖 username 当前值。
// 用法（server 目录）：
//   $env:ADMIN_USERNAME='新账号'; $env:ADMIN_PASSWORD='新密码'; node reset-admin-credentials.cjs
// ⚠️ 连接的库 = server/.env 的 DATABASE_URL（与后端同库）。生产库会改掉生产管理员凭据！
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

(async () => {
  const newUsername = process.env.ADMIN_USERNAME;
  const newPassword = process.env.ADMIN_PASSWORD;
  if (!newUsername || !newPassword) {
    console.error('请设置 $env:ADMIN_USERNAME 和 $env:ADMIN_PASSWORD');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    // 按 SUPER_ADMIN 角色定位（避免依赖 username 当前是 admin 还是别的）
    const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    if (!admin) {
      console.error('未找到 SUPER_ADMIN 用户（先跑 npx prisma db seed 创建 admin）');
      process.exit(1);
    }
    // 新 username 不能占用其他用户
    const clash = await prisma.user.findUnique({ where: { username: newUsername } });
    if (clash && clash.id !== admin.id) {
      console.error(`username="${newUsername}" 已被其他用户占用（userId=${clash.id}）`);
      process.exit(1);
    }
    const hash = await bcrypt.hash(newPassword, 10); // 与 seed.ts 一致：10 rounds
    const updated = await prisma.user.update({
      where: { id: admin.id },
      data: { username: newUsername, password: hash },
    });
    console.log(`✓ 管理员凭据已更新：username="${updated.username}" (userId=${updated.id}, role=${updated.role})`);
    console.log('  原凭据已失效，请用新账号登录。');
    console.log('  注意：此后不要再重跑 prisma db seed，否则会按 username="admin" upsert 出一个新的管理员。');
  } catch (e) {
    console.error('重置失败:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
